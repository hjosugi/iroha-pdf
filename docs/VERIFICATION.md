# Verification report

Verified on 2026-07-12 in the provided Linux build environment.

## Passed

- `npm install`
- `npm run typecheck`
- `npm test`: 2 test files, 6 tests passed
- `npm run build:desktop`: Vite production build passed
- `npx expo-doctor`: 20/20 checks passed
- `npx expo config --type public`: SDK 57 config resolved
- `npx expo export --platform android`: Android Hermes production bundle generated
- `npm ls --all`: dependency tree resolved; only optional native accelerators were absent
- `cargo check --locked`: Tauri Rust code and locked dependency graph passed

## Source ZIP reproducibility

The repository was exported with `git archive` under an `iroha-pdf-v0.1.0/` top-level directory. The ZIP was extracted into a separate clean directory with no existing `node_modules`; `npm ci`, type checking, all 6 tests, desktop production build, Expo Doctor 20/20, and the Android production bundle all passed from that extracted copy.

## Build observations

- Desktop includes PDFium WASM around 4.6 MB before gzip and large JavaScript worker chunks. Lazy loading and code splitting are tracked in performance issues.
- Vite warns that Node `crypto` is externalized from an EmbedPDF model bundle. The browser path uses `globalThis.crypto.randomUUID`; runtime desktop smoke testing is still required.
- Tauri reached the final native Linux link step with Rust 1.95.0 after the missing desktop icon was added. Packaging did not complete because the environment's `libwebkit2gtk-4.1.so` requires `libjxl.so.0.12`, which is absent. This is a host system-library issue; the TypeScript/Vite build and Rust source compilation passed before linking.
- iOS/Android native compile and device tests were not run because Xcode/Android SDK/devices and signing credentials are unavailable.

## Dependency audit

`npm audit --audit-level=high` exited successfully with no high or critical findings. It reported 13 moderate dependency paths that all lead to the same `uuid` advisory through Expo's `xcode` build-time dependency. npm only offers a breaking Expo downgrade as an automated fix, so it was not applied.

The affected API is UUID v3/v5/v6 with a caller-provided buffer. Iroha PDF does not call that API; the dependency is used by Expo configuration/build tooling rather than PDF runtime processing. Keep the finding visible and re-run on every lockfile update. Do not force an incompatible `uuid` override through `xcode`.

## Still requires real environment evidence

- mobile development build with `react-native-pdf`
- Google OAuth client setup and consent screen
- Drive download/update/resumable upload
- AirPrint and Android Print Service
- Tauri package build on a clean Windows/macOS/Linux CI image (this Linux host is missing `libjxl.so.0.12`)
- Windows signing, macOS notarization
- 300 MB and malformed PDF fixtures
- memory and battery profiling
