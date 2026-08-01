# Build workflow

The repository uses two complementary tools:

- [Task](https://taskfile.dev/) v3.52.0 is the cross-platform developer and CI
  entry point.
- [FrostBuild](https://github.com/hjosugi/frost-build) v0.8.0 owns the
  incremental validation graph and the desktop Vite output tree.

npm remains authoritative for the lockfile, dependency installation, Vitest,
TypeScript and Vite. Frost operates above those package-manager boundaries: it
prunes unaffected workspace gates, caches successful tests, and restores the
verified profile-specific tree below `apps/desktop/dist/`.

The release-facing validation scripts — EAS profiles, brand assets and the
vendored dependency patches — are Frost `test` targets rather than bare npm
calls, so they are pruned and cached like every other gate. They read
checked-in configuration and assets, so each one declares those files as
inputs: editing `apps/mobile/app.json` reruns the brand gate and nothing else.

## Install the tools

Install Task with any official method. A version-pinned Go installation is:

```bash
go install github.com/go-task/task/v3/cmd/task@v3.52.0
```

Install FrostBuild v0.8.0 from its
[checksummed release](https://github.com/hjosugi/frost-build/releases/tag/v0.8.0)
and place `frost` on `PATH`. No Frost binary is committed to this repository.

Verify both tools:

```bash
task --version
frost --version
task frost:doctor
```

Every Frost task refuses a binary whose `frost info version` is not the pinned
`0.8.0`, which is the version CI installs from that checksummed archive. Frost
is pre-1.0 and states that a minor release may change manifest or CLI
semantics, so a local run against a different binary would not mean the same
thing as the CI run. Raise `FROST_VERSION` in `Taskfile.yml` and the archive
names plus SHA-256s in `.github/workflows/ci.yml` and
`.github/workflows/release.yml` together. Those workflows install Frost on
Linux, macOS and Windows runners, so all three checksums move at once.

## Common commands

```bash
task install          # npm ci
task check            # every cached gate: tests, typechecks, release validation
task test             # cached unit tests only
task typecheck        # cached typechecks only
task build:desktop    # cached/restorable Vite dist tree
task bundle:desktop   # desktop installers for this host
task validate         # EAS, product-identity and dependency-patch validation
task ci               # the complete fast CI quality workflow
```

`FROST_BIN=/absolute/path/to/frost task check` selects a binary that is not on
the normal `PATH`.

## Packaging the desktop app

`task bundle:desktop` runs `tauri build` through Frost and leaves the finished
installers in `apps/desktop/bundle/release/`. What it emits depends on the host,
because `bundle.targets: "all"` in `tauri.conf.json` selects every bundler the
host supports:

| Host | Packages |
|---|---|
| Linux x86_64 | `.AppImage`, `.deb`, `.rpm` |
| macOS (arm64 runner) | `.dmg`, built for `universal-apple-darwin` |
| Windows x86_64 | `.msi`, NSIS `-setup.exe` |

There is one Frost target per host — `desktop-app-linux`, `desktop-app-macos`,
`desktop-app-windows` — because those three command lines genuinely differ, and
`task bundle:desktop` picks the one for the machine you are on. Each depends on
`desktop-web`, so the Vite tree is built and cached by the graph rather than by
`tauri`'s own `beforeBuildCommand`, which the target overrides to nothing. Each
declares the Rust sources, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json`, the
icons and the vendored `glib` patch as inputs, so an untouched tree is a cache
hit. The packages are staged into `apps/desktop/bundle/${config}` by
`release/desktop/collect-bundles.mjs`, which is also where the build fails if a
host produced an incomplete set or a package carrying the wrong version.

The `release` Frost profile is used deliberately, so these do not share a cache
slot with the `debug`-profile tree `task build:desktop` leaves for local work.

On Linux the bundlers need system packages beyond the ones a Tauri compile
needs:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf xdg-utils
```

`patchelf` rewrites the rpath of the binaries copied into the AppDir, and the
AppImage bundler copies `/usr/bin/xdg-open` into it — without `xdg-utils` the
bundle aborts after the `.deb` and `.rpm` are already written. `linuxdeploy` and
the AppImage runtime are downloaded by `tauri build` itself, so that step needs
network access.

## Cutting a release

Bump every version marker — `package.json`, both app manifests,
`apps/mobile/app.json`, `apps/desktop/src-tauri/tauri.conf.json` and
`Cargo.toml`, plus both lockfiles — add the `## X.Y.Z - YYYY-MM-DD` heading to
`CHANGELOG.md`, and merge that to `main`. Then run the **Release** workflow
from the Actions tab with the same version.

The workflow runs in three stages, and the tag is the last thing it creates:

1. **verify** checks the version against every one of those files and against
   the changelog heading, requires the checks that branch protection demands on
   `main` to have passed on the release commit, and refuses a version that is
   already released or tagged. Nothing exists yet, so a failure here costs
   nothing to correct.
2. **bundle** runs `task bundle:desktop` on `ubuntu-latest`, `macos-latest` and
   `windows-latest` and uploads what each one produced. This job only writes
   files; it cannot touch a tag or a release.
3. **publish** gathers all three sets, writes a `SHA256SUMS` covering them,
   refuses again if a release appeared in the meantime, and creates the GitHub
   release **as a draft** with every asset attached. A draft has no tag — GitHub
   creates `refs/tags/vX.Y.Z` only when the draft is published, which is the
   last step. A failed build or a failed upload therefore leaves no tag and
   nothing downloadable, and an unpublished draft is deleted on the way out.

The release notes are the changelog section for that version, plus a footer
listing the packages and the checksum command.

A release carries, for each platform:

| Platform | Files |
|---|---|
| Linux x86_64 | `.AppImage`, `.deb`, `.rpm` |
| macOS | `.dmg`, universal — Apple silicon and Intel in one binary |
| Windows x86_64 | `.msi`, NSIS `-setup.exe` |

plus `SHA256SUMS` over all of them. Verify a download with
`sha256sum --check --ignore-missing SHA256SUMS`.

**These packages are unsigned**, and the workflow says so on every release.
Windows code signing and macOS notarization are unimplemented (issue #64), and
`docs/RELEASE_GATE.md` is still blocked with every row pending, including the
`Packages` row that would record signature verification. macOS refuses the first
launch through Gatekeeper and Windows shows a SmartScreen warning; users have to
click through both. A matching checksum proves a download is byte-for-byte what
CI built and nothing more — it is not a signature. The workflow also defaults to
marking the release as a pre-release. Turn that flag off, and rewrite the notes'
signing section, once issue #64 and the gate are met.

Frost keeps its journal, graph and content-addressed cache below `.frost/`.
Delete that directory only when intentionally discarding the local build cache;
correctness does not depend on the cache being present.
