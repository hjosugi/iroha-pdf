# Release gate and evidence index

Release approval remains **blocked**. Every row below needs evidence, and each
row that names a device or a package needs it from signed, production-like
artifacts. Put large/private artifacts in the release evidence store, not in
Git; record only checksums and access-controlled links.

| Gate | Platform / fixture | Required evidence | Result |
|---|---|---|---|
| Automated verification | clean checkout | CI URL, test/typecheck/build logs, SBOM | **pass** — see below |
| Startup | all supported devices | cold/warm timings and method | pending |
| Large PDF | low-memory Android, iPad, desktop | 300 MB/500-page peak memory, time-to-first-page, no OOM | pending |
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

- **Implementation and screenshot source:**
  `8860f71804c5377e2c750bdc612f0361cb782889`
- **Clean-checkout CI:**
  <https://github.com/hjosugi/iroha-pdf/actions/runs/30719401503> — all eight
  pull-request jobs passed: quality/Expo, supply chain, three Tauri package builds
  and 69 Playwright tests on each of Linux, macOS and Windows.
- **Unit tests:** 114 total — core 39, google-drive 9, desktop 25, mobile 41.
- **Native rendering:**
  <https://github.com/hjosugi/iroha-pdf/actions/runs/30719408179> — unsigned
  Release builds installed and captured four scenes each on Android phone,
  iPhone and iPad simulators; the assembled 12-image set passed the store asset
  validator and was reviewed at full size.
- **Documentation/store gates:** 18 site pages from 16 documents link-checked;
  two localized listing records and 12 mobile screenshots validated.

This is sufficient evidence for the automated row only. Simulator/emulator
screenshots are not evidence for Startup, Battery/thermal, Rotation/stylus,
Print, Packages, Store privacy or any other production/device row.

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
