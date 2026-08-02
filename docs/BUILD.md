# Build workflow

FrostBuild v0.8.0 is the single build-graph and validation entry point. The
former Taskfile wrapper was removed: local development, CI and Release now call
the same named Frost targets directly, so there is no second command catalogue
that can drift.

npm remains authoritative for the lockfile and dependency installation. Frost
operates above that boundary: it prunes unaffected workspace gates, caches
successful tests, and restores the verified profile-specific desktop output.

## Install

Install Node.js 22.13 or newer, run `npm ci`, then install FrostBuild v0.8.0
from its [checksummed release](https://github.com/hjosugi/frost-build/releases/tag/v0.8.0)
and place `frost` on `PATH`. CI pins and verifies these SHA-256 digests:

| Host | Archive SHA-256 |
|---|---|
| Linux x86_64 musl | `7a70953d61831109daf66cc02f9e93ec2740db1c4fa8bc680530e8b5cae46795` |
| macOS arm64 | `834b3d841e78e5a46851fb84202d49a6faaa5c0cc64d9b9e0cee0fd314d01bf6` |
| Windows x86_64 MSVC | `358e95577aa865b679cf35f31405ae9ffe2f4acc7b586f65cf5a253bd1394b31` |

```bash
npm ci
frost info version    # must print 0.8.0
frost doctor
frost info
```

Frost is pre-1.0, so an upgrade must change the release archive names and all
three checksums in `.github/workflows/ci.yml` and
`.github/workflows/release.yml` together. No Frost binary is committed here.

## Common commands

```bash
# Every unit test, typecheck and release-facing validator
frost test --all --no-tui

# All unit-test targets only
frost test --no-tui \
  iroha-pdf-core-test iroha-pdf-google-drive-test \
  iroha-pdf-desktop-test iroha-pdf-mobile-test

# All TypeScript targets only
frost test --no-tui \
  iroha-pdf-core-typecheck iroha-pdf-google-drive-typecheck \
  iroha-pdf-desktop-typecheck iroha-pdf-mobile-typecheck

# Cached/restorable desktop web output
frost build desktop-web --no-tui

# Debug Tauri binary used by the real-runtime Linux e2e
frost build desktop-app-linux-debug --no-tui

# Dependency-free local documentation build
npm run site
```

`frost test --all` includes EAS policy, brand/store assets, documentation links,
dependency patches, CSS/native design-token enforcement, and the deterministic
large-PDF generator check. CI then builds `desktop-web` separately because it is
a command target with a restorable output tree rather than a test.

`npm ci` also applies `patches/react-native-pdf+7.0.4.patch`. That reviewed patch
adds the current page dimensions to the native page-change event on Android and
iOS, which keeps annotation geometry correct for mixed-size documents. The
dependency-patch gate checks the installed bridge and both native implementations;
an upstream version bump must refresh or remove the patch deliberately.

`patches/react-native+0.86.2.patch` corrects a separate Android pointer-event
gap: upstream 0.86 reports the W3C no-pressure fallback `0.5` even when a pen's
`MotionEvent` contains normalized pressure. The patch forwards real pen pressure;
the Expo config plugin adds the React Native tree as a Gradle composite build and
explicitly substitutes its `ReactAndroid` and `hermes-engine` projects for
`react-android` and `hermes-android`. That compiles the patched Kotlin into the APK
instead of bypassing it with the published React Android AAR, while avoiding a mixed
source/AAR Hermes classpath. It also captures legacy `react-native` and `hermes-engine`
coordinates before the React plugin can rewrite them back to published AARs. The
dependency gate checks the installed source and
the clean prebuild's generated `settings.gradle`; native instrumentation rejects a
fixed-pressure payload. A React Native upgrade must re-audit and either refresh or
remove this patch and the temporary source-build override.

Android's React Native 0.86 pointer dispatcher is still guarded by
`ReactFeatureFlags.dispatchPointerEvents`. The checked-in Expo config plugin
`apps/mobile/plugins/with-android-pointer-events.js` enables it in every generated
`MainApplication`; CI inspects the clean Android prebuild so an Expo or React
Native template change cannot silently disable pen/touch/mouse annotation input.

Brand regeneration additionally needs `rsvg-convert` and ImageMagick. Those
tools are not needed for ordinary validation because the generated assets are
committed and checked directly.

## Desktop installers

Choose the explicit target for the host. Release workflows use exactly these
commands:

```bash
# Linux x86_64: AppImage, deb and rpm
frost build desktop-app-linux --profile release --no-tui

# macOS: universal Apple silicon + Intel dmg
frost build desktop-app-macos --profile release --no-tui

# Windows x86_64: msi and NSIS setup exe
frost build desktop-app-windows --profile release --platform windows --no-tui
```

Each target depends on `desktop-web`, overrides Tauri's `beforeBuildCommand`,
and stages a complete, version-checked package set in
`apps/desktop/bundle/release/` (under the Windows platform overlay on Windows).
The release profile is intentionally separate from local debug outputs.

Linux packaging additionally needs:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf xdg-utils
```

## Mobile device evidence

The normal Android job produces a debug APK. The manually dispatched
`Android low-memory evidence` job goes further: it builds an evidence-only
release APK, boots a 1.5 GiB API 36 AVD, generates a real 300 MiB / 500-page PDF,
and requires open, critical memory trim, background/resume and cold reopen to
succeed. The same build receives native Android instrumentation that dispatches
`TOOL_TYPE_STYLUS` events with rising pressure through the React Native pointer
bridge and reads SQLite back to prove that low and high samples were persisted.
The test also requires live-input and cold-relaunch screen captures plus an
accessibility tree from the running app, not only a successful instrumentation
exit code. After the runner exits, the job cold-relaunches the same document,
selects Pen from the retained target tree, and requires the tree and second image
to show the restored pressure state. A dedicated filtered log records the
persisted sample count and verified low/high bounds.
Its APK alone is not a production artifact; cleartext loopback is
enabled only while `IROHA_DEVICE_EVIDENCE=1` so the ADB-reversed fixture server
can be reached.

API 34 and newer Emulator versions otherwise raise RAM below 2.5 GiB, so the
workflow passes both `-lowram` and `-memory 1536` and rejects an observed
`/proc/meminfo` total above 1.7 GiB. `ro.config.low_ram` is recorded but is not a
gate: it is a read-only product classification of the system image, while the
Emulator's `-lowram` option removes its host-side minimum-RAM override. The
measured RAM, process survival and explicit `RUNNING_CRITICAL` trim are the
evidence this gate claims.

Ordinary builds leave evidence mode disabled, so the route immediately redirects
to the library; the cleartext permission is absent unless the CI-only prebuild
environment enables it.
The job stores fixture metadata, `dumpsys meminfo`, low-memory and stylus logcat,
UI hierarchy, screenshots and instrumentation output for 90 days. A green AVD
run supports the large-PDF and stylus implementation, but does not replace
signed physical-device evidence in `RELEASE_GATE.md`.

## Main protection helper

Preview and then apply the encoded repository policy directly:

```bash
scripts/github/protect-main.sh
APPLY=1 scripts/github/protect-main.sh
```

## Cutting a release

Bump every version marker, add the dated `CHANGELOG.md` section, merge to
`main`, and dispatch the Release workflow. It verifies the protected checks on
the exact commit, runs the three explicit Frost packaging targets, assembles
`SHA256SUMS`, then publishes the draft. The tag is created only at publication,
so a failed build or upload leaves no release tag.

Desktop packages remain unsigned until issue #64 is complete. A checksum proves
the downloaded bytes match CI; it is not code signing or notarization.

Frost keeps its journal, graph and content-addressed cache below `.frost/`.
Deleting it discards local acceleration only; correctness never depends on a
warm cache.
