# Verification report

For **v0.3.0**, commit `0e1786f6aec94b7dde988673b2297fb55afe20b7`.

The authoritative evidence is CI, not a developer machine: run
<https://github.com/hjosugi/iroha-pdf/actions/runs/30684572747> is green on a
clean checkout of that commit across Linux, macOS and Windows. What follows
records what that proves and, more importantly, what it does not.

## Passed in CI

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

- **No packaged desktop application has been built.** CI compiles the native
  binary on all three OSes but does not run `tauri build`, so no `.AppImage`,
  `.deb`, `.dmg`, `.msi` or NSIS installer exists, and none has ever been
  installed or uninstalled. Releases carry no binaries.
- Windows signing and macOS notarization are unimplemented (#64).

Devices and accounts — nothing below has been run on real hardware:

- Mobile development build with `react-native-pdf`; iOS has never been built.
- Google OAuth client and consent screen; Drive download, update and resumable
  upload against the live API.
- AirPrint and the Android Print Service.
- Startup timings, battery and thermal behaviour, memory profiling.
- Rotation and stylus behaviour on an iPad or an Android tablet.

Fixtures and cases still missing:

- A 300 MB document. The largest exercised is the 41.6 MB image-heavy fixture,
  and the measured desktop ceiling stops at 249 MB.
- Encrypted, malformed-but-repairable and AcroForm fixtures now exist, but two
  limits they revealed are unresolved: the app cannot open a password-protected
  PDF at all — there is no prompt — and saving an annotated repairable PDF
  writes an incremental update that leaves the damaged xref in place.

## Environment note

`npx expo-doctor` cannot complete in the sandboxed environment used for this
report: one check fetches the Expo config schema over the network and the proxy
refuses it. This is a limitation of the environment, not a project finding —
CI's `expo config --type public` passes.
