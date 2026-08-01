# Changelog

## 0.3.0 - 2026-08-01

Source preview. Native signed packages are still not included; see
`docs/RELEASE_GATE.md`, which remains blocked, and the open signing and
device-verification issues.

### Fixed

- Annotating in Japanese no longer breaks export and print. `flattenAnnotations`
  embedded Helvetica unconditionally, and Helvetica is WinAnsi, so pdf-lib threw
  `WinAnsi cannot encode "こ"` as soon as a text annotation held Japanese — the
  app's primary locale. Mobile export and mobile print both route through the
  same call, so both failed, naming neither the annotation at fault nor anything
  the user could do. A Japanese face now ships with the app and is embedded as a
  subset; text the chosen font cannot encode is now rejected before anything is
  written, naming the character.
- Annotations stay where they were put on a rotated page. Coordinates were
  mapped through the unrotated MediaBox, so on a page carrying `/Rotate` a mark
  placed at the displayed top-left was flattened to whichever corner the
  rotation carried it to — top-right at 90°, bottom-right at 180°, bottom-left
  at 270° — and text was drawn sideways on every quarter turn.
- Autosave says so when it cannot write. A full quota was caught and discarded,
  so the editor looked like it was drafting when nothing was being stored.
- The mobile write journal no longer hides its own failure. When the lock or
  full disk that refused a write also refused the bookkeeping, the entry stayed
  `pending` and the Recovery screen offered nothing for the rest of the session,
  while the caller told the user the edit was gone.

### Added

- Releases are cut by a workflow that checks the version against every manifest
  and the changelog heading, refuses a commit whose required CI checks did not
  pass, and creates the tag and the GitHub release together, so a failed check
  cannot leave a dangling tag.
- `apps/mobile` has tests. It previously had none — no script, no files, no
  gate — leaving the SQLite schema, the write journal and crash recovery
  unprotected. They run `database.ts` against `node:sqlite`, the same engine, so
  WAL, foreign keys, upserts, ordering and `SQLITE_BUSY` are exercised rather
  than recorded against a double.
- Desktop print-dialog coverage for page range, current page and the
  include-annotations toggle, and encrypted, malformed-but-repairable and
  AcroForm fixtures with tests. Two limits are recorded rather than papered
  over: the app cannot open a password-protected PDF, and saving an annotated
  repairable PDF leaves the damaged xref in place.

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
