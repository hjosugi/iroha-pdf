# Changelog

## Unreleased

### Added

- A page strip in the desktop side panel. Every page has a slot from the start,
  so the list is the right length and scrolls correctly immediately, and each
  picture is drawn only when its page comes near the view — a 500-page document
  draws single digits of them rather than 500. What has been drawn is held to a
  byte budget and released in least-recently-seen order, which is the first thing
  to use the bounded cache that had been sitting in `@iroha-pdf/core` with tests
  and no caller. Leaving the tab releases every bitmap it was holding.

### Changed

- The desktop application no longer ships pdf-lib and fontkit. It never called
  either — its PDF work is all wasm — but it imports two i18n functions from
  `@iroha-pdf/core`, whose barrel re-exports the module that does use them, and
  nothing told the bundler it was free to drop that graph. Application
  JavaScript went from 1.80 MB to 0.63 MB, and pdf-lib leaves the desktop's
  installed dependencies and its SBOM. First contentful paint did not measurably
  change; the shell already paints before the engine loads.
- The rules that turn a document's path into the names a save works with live in
  one module now. The e2e suite carried its own copy, because the module they
  were in reaches for Tauri at import time, so renaming one in the application
  moved the assertions onto the same different file instead of failing.

### Fixed

- A save that fails now takes its own half-written bytes with it, instead of
  leaving a `.iroha-part.pdf` beside the document. Those bytes are never what an
  interrupted edit is recovered from — the draft is — so a file named almost
  like the document was only ever going to be mistaken for it. The webview still
  cannot delete anything: the app derives the one path it may remove on the Rust
  side, so it can reach a document's partial and nothing else. If the clean-up
  itself fails, the file stays and the error says where.

## 0.5.0 - 2026-08-07

A desktop save can no longer be interrupted into losing the document. The new
bytes are assembled beside the file and renamed over it in one step, so a crash
or a full disk leaves the file exactly as it was; the first overwrite of a file
opened through the dialog also used to fail outright, on a scope the dialog
never granted. Mobile keeps an interrupted edit through a full disk, and a full
disk no longer stops the app from opening.

The desktop packages are still **unsigned**: macOS Gatekeeper refuses the first
launch and Windows SmartScreen warns, because signing and notarization are
unimplemented (#64) and `docs/RELEASE_GATE.md` still has its package, device and
account rows pending. Check a download against `SHA256SUMS`, which records what
CI built — it is not a signature.

### Added

- Native mobile pen input records pointer identity and per-point pressure, uses
  the same variable-width mapping in the on-screen preview and flattened PDF,
  and has Android instrumentation that injects `TOOL_TYPE_STYLUS` events and
  reads the persisted SQLite payload back. The retained evidence includes the
  pressure endpoints, in-app screen, and accessibility tree.
- A controlled Android evidence gate generates a deterministic 300 MiB /
  500-page PDF, boots a 1.5 GiB API 36 AVD, and requires cold open, critical
  trim, background/resume, cold reopen, and process survival. Mobile export and
  print reject inputs above 64 MiB before the JavaScript heap is exhausted;
  native viewing and annotation autosave remain available.
- Reproducible, store-ready screenshot sets for Android phones, 6.9-inch
  iPhones, and 13-inch iPads. A release-configured native app loads only a
  deterministic synthetic PDF, and CI records the source commit, run, emulator,
  dimensions, RGB encoding, and scene order with the committed images.
- Complete English and Japanese App Store and Google Play listing copy, plus a
  validator for every current field limit, URL, screenshot, alt text, and asset
  provenance.
- Google Play's mandatory 1024x500 feature graphic and separate 512x512 RGBA
  listing icon, generated from the same font-independent SVG brand source.
- A full English project overview mirrors the current Japanese README and is
  published beside it on GitHub Pages with working language navigation.

### Fixed

- A desktop save no longer writes into the document it is replacing. The bytes
  are assembled beside it and renamed over it in one step, so a crash or a full
  disk partway through leaves the file exactly as it was rather than a fragment
  where the document used to be. Every save failure now says the file on disk is
  unchanged.
- The first overwrite of a file opened through the desktop dialog failed with a
  forbidden path: the dialog grants exactly the file it returned, so the
  `.iroha-original.pdf` copy taken beside it was never in scope. A narrow
  `allow_derived_file` command grants that one derived name, and the
  real-runtime suite now runs under the same single-file scope the dialog gives,
  where the whole save path is exercised as a user meets it.
- A full disk no longer stops the mobile app from opening. Reconciling an
  interrupted edit at launch is bookkeeping over work that is already durable
  one way or the other, so a status update that cannot be written now leaves the
  entry for the next launch instead of taking the database layer down. When
  there is no room to record an interrupted edit at all, the failure says so
  rather than implying a recovery copy exists.
- Main CI now compiles and retains Android debug APKs in four parallel ABI jobs.
  All supported ABIs remain covered, while one runner no longer holds every
  React Android source-build intermediate until a universal APK packaging step.
- The Linux real-Tauri gate now accepts both WebKitGTK object results and
  Chromium-style JSON strings, waits until the Shape tool is actually active,
  checks WebDriver action errors, and refuses a save unless the reopened PDF
  contains the annotation. This removes both a false harness failure and a
  possible false pass where an unchanged document was merely rewritten.
- Android Expo prebuild now enables React Native's guarded pointer-event
  dispatcher before the runtime starts. Without that generated
  `MainApplication` setting, typed `onPointer*` handlers compiled but never
  received touch, mouse, or stylus events in an Android APK. A reviewed React
  Native 0.86.2 patch also forwards Android's normalized `MotionEvent` pen
  pressure instead of replacing every active pen sample with `0.5`; Android
  prebuild compiles that patched bridge and its matching Hermes engine from
  source rather than silently using the unmodified React Android AAR or mixing
  it with duplicate published classes through legacy Maven coordinates.
- Mobile annotation coordinates now use the rendered dimensions of the current
  PDF page, including mixed-size documents. Selecting an edit tool returns to
  100%, keeps its controls in a fixed overlay so the page does not jump, and
  allows the full 44-logical-unit control row to scroll on narrow screens. The
  pressure state now uses a separate token-sized badge, so it cannot clip the
  width controls, and returns when pressure-aware ink is reloaded from SQLite.
  The Android evidence job now cold-relaunches the document before retaining
  its accessibility tree, avoiding a Launcher tree after the instrumentation
  Activity is torn down. It retains separate live-input and cold-reload images,
  with the Pen controls and persisted badge visible in both states.
- Desktop and documentation sizing now comes from CSS custom properties, while
  React Native uses typed spacing, control, type, radius, and layout tokens. A
  Frost validation target rejects newly scattered fixed sizes. The redundant
  Taskfile/go-task command layer was removed; local, CI, and Release builds call
  the pinned FrostBuild v0.8.0 graph directly.
- Mobile library, viewer, notes, tools, Drive, and recovery screens now use
  bounded tablet layouts, safe areas, at least 44-logical-unit primary targets, and
  screen-reader roles, names, hints, and selected/disabled states. Empty,
  loading, missing-document, retry, and irreversible-action states are explicit.
- Document and note deletion now removes the private local copy and related
  database/recovery records without touching the provider original. Annotation
  add/delete/undo/redo updates the screen only after SQLite accepts the change.
- Google Drive no longer presents a usable-looking connect action when OAuth is
  absent, and connected users can refresh, sign out, or revoke access. A
  downloaded PDF opens immediately.
- Mobile and desktop user-facing UI now share the typed Japanese/English message
  catalogue. Desktop tabs use valid independent controls, narrow windows retain
  the history/note panel, toolbars scroll instead of clipping, keyboard focus is
  visible, and the print dialog supports Escape and restores focus.
- iOS prebuild now gives Google Sign-In's transitive Swift dependencies module
  maps and the native screenshot build selects the Swift 6.2 toolchain required
  by Expo SDK 57.
- Release manifests explicitly remove unused microphone, camera, Face ID,
  Android dev-overlay, and legacy broad-storage permissions while retaining a
  specific photo-library purpose for the image-to-PDF feature.
- README, security, architecture, privacy, build, test, Drive, store, and
  verification documents now distinguish the current v0.4.0/`Unreleased`
  implementation from planned sync, signed distribution, and physical-device
  validation.

## 0.4.0 - 2026-08-01

The first release that carries installable desktop applications. They are
**unsigned**: macOS Gatekeeper refuses the first launch and Windows SmartScreen
warns, because signing and notarization are unimplemented and
`docs/RELEASE_GATE.md` is still blocked despite automated verification passing;
the device-, account- and package-dependent rows remain pending. Check a
download against `SHA256SUMS`, which records what CI built — it is not a
signature.

### Added

- Desktop packages are built for all three operating systems and attached to
  the release: **AppImage, deb and rpm** on Linux, a universal **dmg** on macOS,
  and **msi** and NSIS **exe** installers on Windows. CI previously compiled the
  binary on each OS but never ran the bundler, so no installer had ever been
  produced and no release carried one.
- Packaging runs through the build graph rather than as a command in a workflow
  file, so it declares its inputs, depends on the web build instead of letting
  the bundler shell back out to npm, and caches like everything else.
- A release is assembled as a draft with every package already attached and is
  published only once that succeeds. Publishing is what creates the tag, so a
  failed build leaves no tag, no release page and nothing downloadable.
- The documentation is published as a static site: 15 documents and a landing
  page, with no generator, no CDN and no JavaScript, enforced by a per-page
  content-security policy and a link checker that runs in CI. The privacy policy
  now has the stable URL the store checklist asks for.
- The desktop window and the site carry a favicon, which the app had never had.

### Fixed

- Three defects that only appear on a runner this project had never packaged on:
  macOS ships a BSD `sha256sum` that rejects `--check`; GNU `sha256sum` escapes
  the digest line for a filename containing a backslash, which every Windows
  path has; and npm is `npm.cmd` on Windows, which a directly spawned build
  action cannot resolve without naming it per platform.

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
