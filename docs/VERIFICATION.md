# Verification report

For **v0.4.0**, commit `0bb56eaafa94dee26f0f6c685acdfb29308c7338`.

This is a release snapshot, not a claim that every later `main` change is covered by
the same run. After v0.4.0, `main` commit `f14b456677e60bfff23bf305e6617ccbeb57dbf7`
added store submission inputs. Its CI run 30712634194 passed, and native screenshot run
30711299124 built unsigned Release apps for Android, iPhone Simulator and iPad
Simulator. The additions do not change the physical-device and signed-artifact gaps
listed below.

## Unreleased UI/UX and documentation audit — 2026-08-02

Implementation commit `eaf6553c1bfd60cbd6f0903053bf1c082b4c6cba` is the
source commit for the audit. Native screenshots are bound separately to their
exact UI source below.

- [CI run 30743015338](https://github.com/hjosugi/iroha-pdf/actions/runs/30743015338)
  completed successfully: all eight required pull-request jobs and the additional
  real-Tauri runtime job passed on a clean checkout (quality/Expo, supply chain,
  three desktop package builds, real runtime and Playwright on Linux, macOS and
  Windows). The main-only Android debug job was intentionally skipped.
- The run passed 128 unit tests — core 41, google-drive 9, desktop 26 and mobile
  52 — plus the 70-case Playwright suite in 14 spec files on each desktop OS:
  70 passed on Linux and macOS; Windows passed 66 and explicitly skipped four
  renderer-dependent cases. All 22 Linux real-runtime checks passed. It also
  built and link-checked 20 site pages from 18 documents and validated two store
  locales and 12 mobile screenshots.
- [Native screenshot run 30731064514](https://github.com/hjosugi/iroha-pdf/actions/runs/30731064514)
  at `c8d7d78e448809e6f97f0dadac03fa3246b9f76d`
  built unsigned Release apps, installed them on a Pixel 6 AVD, iPhone 17 Pro Max
  Simulator and iPad Pro 13-inch Simulator, captured four ordinary product
  scenes per device, then validated and assembled the submission artifact. The
  committed `release/store/screenshots/evidence.json` binds those images to the
  exact run and source commit. All 12 images were also reviewed at full size for
  clipping, safe areas, tablet width, touch-target layout and truthful OAuth state.
- [Controlled Android run 30743017733](https://github.com/hjosugi/iroha-pdf/actions/runs/30743017733)
  used the exact implementation commit. It generated a deterministic
  314,720,686-byte / 500-page PDF, booted Android 16 with 1,503,188 KiB RAM,
  opened the document, delivered a critical-memory trim, backgrounded/resumed,
  killed the process and reopened the same document. ActivityManager measured
  2,816 ms cold open, 1,063 ms resume and 2,684 ms process-cold reopen. The three
  point-in-time PSS/RSS readings were 436,549/517,624, 426,008/511,232 and
  433,927/523,788 KiB; this is not a continuous peak profile. The app remained
  responsive without an Iroha PDF crash, ANR or OOM. The same release build
  received native `TOOL_TYPE_STYLUS` input with pressure rising from 0.18 to
  0.90; instrumentation read nine samples back from SQLite. Separate live-input
  and process-cold-reload images show the complete pressure badge and
  variable-width stroke. The reload tree identifies Iroha PDF, page 1/500 and
  pen width 2.4. Screens, trees, timings, memory snapshots, logs and the
  instrumentation transcript are retained in the run artifact for 90 days.

This evidence covers the implemented UI/UX, simulator/emulator rendering and
the controlled Android portion of the large-document gate. It does not change
any physical-device, production OAuth, signed artifact, store-submission,
battery/thermal, iPad-memory or desktop-continuous-memory gate below.

For the v0.4.0 snapshot below, the authoritative evidence is CI rather than a
developer machine: run
<https://github.com/hjosugi/iroha-pdf/actions/runs/30691337190> is green on a
clean checkout of the v0.4.0 commit across Linux, macOS and Windows. What follows
records what that dated run proves and, more importantly, what it does not.

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
- Physical-device startup timings, battery and thermal behaviour, and continuous
  memory profiling. The bounded Android AVD open/resume/reopen run above is not
  a substitute for these measurements.
- Rotation and stylus behaviour on an iPad or an Android tablet.

Fixtures and cases still missing:

- The deterministic 300 MiB / 500-page fixture now passes the bounded Android
  AVD flow. A scanned-content fixture of that size, the same case on iPad and
  desktop, and continuous peak-memory measurement are still missing; the prior
  desktop ceiling remains 249 MB.
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
