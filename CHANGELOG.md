# Changelog

## 0.2.0 - 2026-07-31

Source preview. Native signed packages are still not included; see
`docs/RELEASE_GATE.md`, which remains blocked, and the open signing and
device-verification issues.

### Fixed

- The desktop PDF engine is bundled instead of downloaded. `usePdfiumEngine`
  was called without a `wasmUrl`, so pdfium came from `cdn.jsdelivr.net` at
  runtime: with no network a valid PDF never opened, sitting on `Opening PDF…`
  with no error and no timeout. It also put the code that parses untrusted
  PDFs outside the SBOM, the licence allowlist and both advisory audits, and
  aimed at a host the app's own `connect-src 'self'` policy forbids. Bundling
  it surfaced a second fault with the same symptom — Vite emits a
  root-absolute path that a `blob:` worker base cannot resolve — so the URL is
  now resolved against the document first. Guarded by `e2e/offline.spec.ts`,
  which blocks off-origin requests and records them at the same time.

### Changed

- The build graph is pinned to FrostBuild v0.8.0, and the EAS, brand-asset and
  dependency-patch validations are Frost `test` targets declaring the
  checked-in files they read, rather than uncached npm calls. Every Frost task
  refuses a binary whose `frost info version` is not the pinned one.

### Documentation

- Corrected the CI issue in the backlog: the e2e matrix, the Tauri matrix,
  Expo prebuild validation and the SBOM/licence scan were recorded as
  unimplemented or unverified, and all four have been running and passing.

## 0.1.0 - 2026-07-12

Initial source preview of Iroha PDF.

- Expo mobile workspace for importing, viewing, annotating, exporting, and printing PDFs
- Tauri desktop workspace using EmbedPDF
- Local notes, SQLite persistence, and shared mobile/desktop data models
- Image-to-PDF, structural optimization, page reorder/duplicate/merge/extract/remove/rotate tools
- Google Drive least-privilege REST client and starter mobile flow
- Architecture, repository research, test plan, privacy/security model, and 65-item implementation backlog

Native signed packages are not included in this release. See `docs/VERIFICATION.md` and the open issues for device, OAuth, signing, and store-release work.
