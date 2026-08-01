# Verification report

For **v0.4.0**, commit `0bb56eaafa94dee26f0f6c685acdfb29308c7338`.

This is a release snapshot, not a claim that every later `main` change is covered by
the same run. After v0.4.0, `main` commit `f14b456677e60bfff23bf305e6617ccbeb57dbf7`
added store submission inputs. Its CI run 30712634194 passed, and native screenshot run
30711299124 built unsigned Release apps for Android, iPhone Simulator and iPad
Simulator. The additions do not change the physical-device and signed-artifact gaps
listed below.

## Unreleased UI/UX and documentation audit — 2026-08-02

Implementation commit `8860f71804c5377e2c750bdc612f0361cb782889` is the
source commit for the audit and its native screenshots.

- [CI run 30719401503](https://github.com/hjosugi/iroha-pdf/actions/runs/30719401503)
  completed successfully: all eight pull-request jobs passed on a clean checkout
  (quality/Expo, supply chain, three desktop package builds and Playwright on
  Linux, macOS and Windows). The main-only Android debug job was intentionally
  skipped.
- The run passed 114 unit tests — core 39, google-drive 9, desktop 25 and mobile
  41 — plus all 69 Playwright tests in 14 spec files on each desktop OS. It also
  built and link-checked 18 site pages from 16 documents and validated two store
  locales and 12 mobile screenshots.
- [Native screenshot run 30719408179](https://github.com/hjosugi/iroha-pdf/actions/runs/30719408179)
  built unsigned Release apps, installed them on a Pixel 6 AVD, iPhone 17 Pro Max
  Simulator and iPad Pro 13-inch Simulator, captured four ordinary product
  scenes per device, then validated and assembled the submission artifact. The
  committed `release/store/screenshots/evidence.json` binds those images to the
  exact run and source commit. All 12 images were also reviewed at full size for
  clipping, safe areas, tablet width, touch-target layout and truthful OAuth state.

This evidence covers the implemented UI/UX changes and simulator/emulator
rendering. It does not change any physical-device, production OAuth, signed
artifact, store-submission or performance gate below.

The authoritative evidence is CI, not a developer machine: run
<https://github.com/hjosugi/iroha-pdf/actions/runs/30691337190> is green on a
clean checkout of that commit across Linux, macOS and Windows. What follows
records what that proves and, more importantly, what it does not.

## Passed in v0.4.0 CI

- `npm ci` from the committed lockfile.
- Typecheck across all four workspaces.
- 96 unit tests — core 32, google-drive 9, desktop 25, mobile 30.
- Playwright end-to-end suite, 14 spec files, run on ubuntu, macOS and Windows.
  Cross-renderer checks use poppler and Ghostscript where they are installed and
  skip themselves where they are not, which is Windows.
- Desktop production build (Vite).
- `cargo build --release --locked` on all three desktop OSes.
- Expo: `expo config --type public` and `expo prebuild --platform android`, plus
  an Android debug APK.
- Supply chain: npm and cargo CycloneDX SBOMs, licence allowlists, `cargo audit`,
  and dependency-patch verification. `npm audit --omit=optional
  --audit-level=moderate` reports **0 vulnerabilities**; the `uuid` advisory
  reached through Expo's `xcode` tooling that the v0.1.0 report tracked is gone.

## Fixed since the v0.1.0 report

- The desktop build no longer fetches its PDF engine from `cdn.jsdelivr.net` at
  runtime. Opening a local PDF with no network hung on `Opening PDF…` forever;
  the engine is now bundled, and `apps/desktop/e2e/offline.spec.ts` fails the
  build if any off-origin request reappears.
- Annotating in Japanese no longer throws `WinAnsi cannot encode`, and
  annotations no longer drift to another corner on a page carrying `/Rotate`.
- `apps/mobile` has tests at all. It previously had none, so the SQLite schema,
  the write journal and crash recovery were entirely unverified.

## Not proven by any of the above

Packaging and signing:

- Packages are now built and published — AppImage, deb and rpm on Linux, a
  universal dmg on macOS, msi and NSIS installers on Windows, with SHA256SUMS.
  The Linux AppImage was launched to confirm it starts; **no package on any
  platform has been installed or uninstalled**, and the `Packages` row of
  `docs/RELEASE_GATE.md` stays `pending` for that reason.
- Every package is **unsigned**. Windows signing and macOS notarization are
  unimplemented (#64), so macOS Gatekeeper refuses the first launch and Windows
  SmartScreen warns. A matching SHA256SUMS entry proves a download is what CI
  built; it says nothing about who built it.

Devices and accounts — nothing below has been run on real hardware:

- Signed mobile production builds on physical hardware. Android and iOS Release
  Simulator/Emulator builds now exist, but are not device or signing evidence.
- Google OAuth client and consent screen; Drive download, update and resumable
  upload against the live API.
- AirPrint and the Android Print Service.
- Startup timings, battery and thermal behaviour, memory profiling.
- Rotation and stylus behaviour on an iPad or an Android tablet.

Fixtures and cases still missing:

- A 300 MB document. The largest exercised is the 41.6 MB image-heavy fixture,
  and the measured desktop ceiling stops at 249 MB.
- Encrypted, malformed-but-repairable and AcroForm fixtures now exist. Mobile has
  a password prompt and does not persist the password, but that path still lacks
  physical-device evidence; desktop still refuses encrypted PDFs. Saving an
  annotated repairable PDF writes an incremental update that leaves the damaged
  xref in place.

## Environment note

`npx expo-doctor` cannot complete in the sandboxed environment used for this
report: one check fetches the Expo config schema over the network and the proxy
refuses it. This is a limitation of the environment, not a project finding —
CI's `expo config --type public` passes.
