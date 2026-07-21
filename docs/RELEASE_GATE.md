# Release gate and evidence index

Release approval remains **blocked** until all rows below contain evidence from
signed, production-like artifacts. Put large/private artifacts in the release
evidence store, not in Git; record only checksums and access-controlled links.

| Gate | Platform / fixture | Required evidence | Result |
|---|---|---|---|
| Automated verification | clean checkout | CI URL, test/typecheck/build logs, SBOM | pending |
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
