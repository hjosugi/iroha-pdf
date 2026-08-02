# Release gate and evidence index

Release approval remains **blocked**. Every row below needs evidence, and each
row that names a device or a package needs it from signed, production-like
artifacts. Put large/private artifacts in the release evidence store, not in
Git; record only checksums and access-controlled links.

| Gate | Platform / fixture | Required evidence | Result |
|---|---|---|---|
| Automated verification | clean checkout | CI URL, test/typecheck/build logs, SBOM | **pass** — see below |
| Startup | all supported devices | cold/warm timings and method | pending |
| Large PDF | low-memory Android, iPad, desktop | 300 MB/500-page peak memory, time-to-first-page, no OOM | **partial** — controlled Android AVD passed; iPad, desktop and physical devices pending |
| Battery/thermal | iOS and Android | 30-minute reading/annotation run, battery delta, thermal state | pending |
| Rotation/stylus | iPad and Android tablet | recording, annotation alignment after zoom/rotation | pending |
| Crash recovery | mobile | kill/disk-full/DB-lock matrix and recovery-copy recording | pending |
| Drive conflict | two devices | revision IDs, queue log with redacted IDs, conflict UI recording | pending |
| Export/reopen | Preview, Chrome, Acrobat, Drive viewer | SHA-256, page/text checks, sample checksum | pending |
| Print | Windows, macOS, Linux, AirPrint, Android | preview and physical/PDF output evidence | pending |
| Packages | each target OS | signature/notarization verification, install/uninstall result | pending |
| Store privacy | iOS and Android | manifest scan, submitted declarations, published policy URL | pending |

Approvers must record the release commit, artifact hashes, date, device/OS
versions, failures or waivers, and their name. A row without reproducible
evidence is not a pass.

## Automated verification — Unreleased audit (2026-08-02)

- **Implementation source:**
  `eaf6553c1bfd60cbd6f0903053bf1c082b4c6cba`
- **Clean-checkout CI:**
  <https://github.com/hjosugi/iroha-pdf/actions/runs/30743015338> — all eight
  required pull-request jobs plus the real-Tauri runtime job passed: quality/Expo,
  supply chain, three Tauri package builds, the 70-case Playwright suite on each
  OS (70 pass on Linux/macOS; 66 pass and four renderer-dependent skips on
  Windows), and 22 real-runtime checks on Linux.
- **Unit tests:** 128 total — core 41, google-drive 9, desktop 26, mobile 52.
- **Native rendering:**
  <https://github.com/hjosugi/iroha-pdf/actions/runs/30731064514> at
  `c8d7d78e448809e6f97f0dadac03fa3246b9f76d` — unsigned Release builds
  installed and captured four scenes each on Android phone, iPhone and iPad
  simulators; the assembled 12-image set passed the store asset validator and
  was reviewed at full size. Later commits do not alter any captured scene; the
  pressure badge added afterward appears only after live pen input.
- **Controlled Android memory and pen input:**
  <https://github.com/hjosugi/iroha-pdf/actions/runs/30743017733> at the exact
  implementation source — a 314,720,686-byte, 500-page PDF was opened on an API
  36 AVD with 1,503,188 KiB total RAM, then subjected to `RUNNING_CRITICAL`,
  background/resume and process-cold reopen. ActivityManager reported 2,816 ms
  cold open, 1,063 ms hot resume and 2,684 ms process-cold reopen. The open,
  resume and reopen `dumpsys meminfo` snapshots respectively reported PSS/RSS
  of 436,549/517,624, 426,008/511,232 and 433,927/523,788 KiB; these are bounded
  snapshots, not a continuous peak profile. The retained logs contain no Iroha
  PDF crash, ANR or OOM. Native `TOOL_TYPE_STYLUS` input traversed Android's
  input dispatcher and the React Native pointer bridge; nine low-to-high
  pressure samples were read back from SQLite. Separate live-input and
  process-cold-reload images show the complete pressure badge and variable-width
  stroke, while the retained reload tree names the package, page 1/500 and pen
  width. All artifacts are retained for 90 days.
- **Documentation/store gates:** 20 site pages from 18 documents link-checked;
  two localized listing records and 12 mobile screenshots validated.

This passes the automated row and the controlled-Android portion of Large PDF.
Simulator/emulator evidence is not a physical-device pass for Startup,
Battery/thermal, Rotation/stylus, Print, Packages or Store privacy; those rows
stay blocked.

## Automated verification — v0.3.0

The evidence below is the v0.3.0 run. v0.4.0 (`0bb56ea`) passed the same nine
jobs; the artifacts are now named `desktop-packages-<os>` and additionally
carry the built installers.

- **Release commit:** `0e1786f6aec94b7dde988673b2297fb55afe20b7` (tag `v0.3.0`)
- **CI run:** <https://github.com/hjosugi/iroha-pdf/actions/runs/30684572747> —
  all nine jobs green on a clean checkout of that commit. `android` runs here
  because this was a push to `main`; it is skipped on pull requests and is not
  one of the eight checks branch protection requires.
- **Jobs:** Quality and Expo validation · Supply-chain policy ·
  Tauri (ubuntu / macos / windows-latest) · e2e (ubuntu / macos / windows-latest)
  · android
- **Tests:** 96 unit tests — core 32, google-drive 9, desktop 25, mobile 30 —
  plus the Playwright suite across 14 spec files on all three desktop OSes.
- **Artifacts:** `quality-artifacts` (typecheck, build and Expo validation
  output), `tauri-Linux` / `tauri-Windows` / `tauri-macOS`, `app-debug-apk`,
  and `supply-chain-reports` — npm and cargo CycloneDX SBOMs, licence
  allowlist results and `cargo audit`, retained 90 days (to 2026-10-30).

This row covers the clean-checkout build and its SBOM only. It is not evidence
about a packaged, signed or installed application: the **Packages** row stays
`pending`, and desktop signing and notarization are unimplemented (#64).
