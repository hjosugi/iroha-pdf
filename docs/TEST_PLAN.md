# Test plan

## Automated

```bash
npm test              # unit
npm run typecheck     # app sources + e2e sources
npm run build:desktop
npm run e2e           # Playwright/Chromium: editing, save path, performance budgets
npm run e2e:tauri     # the real Tauri binary via tauri-driver (Linux desktop session)
```

The core suite builds deterministic mixed-size text fixtures and automatically
checks page count, dimensions, decoded text operators, corrupt-input rejection,
and reopen after reorder/extract/optimization. Renderer golden screenshots
remain part of the device/desktop E2E gate because `pdf-lib` does not render.

`e2e:tauri` needs `cargo install tauri-driver`, a `WebKitWebDriver` binary, a debug app
build (`cd apps/desktop/src-tauri && cargo build`), a vite dev server on port 1420, and a
running graphical session. It opens a real window.

Two diagnostics are excluded from the default run because they are slow, write hundreds
of megabytes of fixtures, and in one case deliberately kill the renderer:

```bash
# stage-by-stage heap breakdown, and the Chromium harness's own ceiling
npx playwright test memory-probe --project=chromium
# how large a PDF the real app can open, measured against real files on disk
npm run e2e:tauri:ceiling
```

`npm run e2e` builds fixtures on first run (`apps/desktop/e2e/global-setup.ts`) into
`apps/desktop/e2e/fixtures/`, which is gitignored. Delete that directory to rebuild them.

### What the e2e suite covers

The desktop save path only runs when `window.__TAURI_INTERNALS__` exists, so
`apps/desktop/e2e/tauri-stub.ts` reimplements the `plugin:fs|*` / `plugin:dialog|*`
invoke protocol over an in-memory filesystem. The application code under test is the
real one; only the runtime beneath it is substituted. Tests then read back the exact
bytes that would have hit disk.

| Area | Checks |
|---|---|
| opening | the painted page really is page 1 of the document; a later page renders and differs; all 500 pages are reachable; mixed sizes and rotations keep their own geometry; the tab and path reflect the file; an unreadable file fails visibly without offering editing tools or leaking engine errors |
| editing | annotation lands in the saved PDF; tables, images, CJK text and page count survive; one-time original backup; backup not clobbered by later saves; save-as leaves the source untouched; cancelled dialog writes nothing; rotated/mixed page geometry; edit history entries |
| tools | Highlight over text, a pen stroke, a written note and a shape each reach the saved file as the right annotation type; several coexist; Delete removes the selected mark; undo/redo; saving inside the pen's commit delay still keeps the stroke |
| tool settings | the colour and width picker appears only while a tool is held; a chosen colour and width are the values written into the annotation's `/C` and `/BS /W`; each tool keeps its own colour; the choice survives a restart |
| editing existing marks | selecting a mark shows a picker bound to it; recolouring or rethinning rewrites `/C` and `/BS /W` in the saved file and the value actually changes; a highlight offers the highlight palette and no width; the change counts as unsaved work |
| printing | the print frame is handed a real PDF with every page and image intact; annotations are included; printing leaves the document being edited untouched |
| unsaved work | closing a tab mid-edit asks first and backing out keeps the edits; confirming closes; a saved or untouched document closes without a prompt; the window-close guard arms and disarms with the pending count |
| autosave | an edit is drafted without being asked; saving clears the draft; work survives a simulated crash (page reload) and is offered back; restoring reports the work as still unsaved and it then reaches the file; discarding is permanent |
| rendering | poppler and Ghostscript both draw the annotation at the drawn coordinates, and nowhere else; a save with no edits is pixel-identical |
| performance | 500-page first-page latency, heap, deep scroll; 40 MB scan open/annotate/save; bundle weight; shell paint before the wasm engine loads |

Printing is checked by capturing the blob passed to the print frame, not by driving the
native dialog — a dialog would block the run. `window.print` is neutralised on the page
and on any frame it creates so one can never open by accident.

## Mobile build status

**Android builds.** Verified 2026-07-20 on a cold machine: SDK command-line tools,
platform 36 and build-tools 36.0.0 installed by hand; Gradle 9.3.1 then fetched the NDK
(2 GB) and cmake itself. `./gradlew assembleDebug` finished in **42m 51s** and produced a
**283.1 MB** `app-debug.apk` — package `app.irohapdf.mobile`, versionName 0.1.0, all four
ABIs, 112 native libraries. The size is a debug build carrying unstripped libraries for
every ABI; release/AAB size is still unmeasured.

`ci.yml` has an `android` job that reproduces this. It is deliberately **not** run on pull
requests — 43 minutes cold is too much to gate every change on — so it runs on `main` and
via `workflow_dispatch`, caching `~/.gradle` and the NDK.

**It also runs.** `npm run verify:emulator` installs the APK on a booted emulator, starts
Metro, launches the app and checks seven things — all passing on
`system-images;android-36;google_apis;x86_64`. The one that matters is the logcat line
`Running "main" with {"rootTag":1,"fabric":true}`: this APK embeds `expo-dev-client`, which
shows its launcher and keeps the process alive even when no bundle ever arrives, so
"installed and running" proves nothing on its own. `ReactNativeJS` output is what
separates installed from working.

Looking at the screen is what found issue 074 — every screen overlapped the status bar,
because `SafeAreaView` from `react-native` is an iOS-only no-op on Android. Neither
typecheck nor the build says a word about that.

**iOS has never been built and cannot be built here**: it needs macOS and Xcode. That
needs EAS (issue 058) or a macOS runner.

The mobile app still has **no unit tests**. Its `src/lib` modules are thin wrappers over
expo-sqlite and expo-file-system, so tests there would mostly exercise mocks; the logic
worth testing (coordinates, merge) lives in `packages/core`, which is covered.

The "really is page 1" check screenshots what the app painted and compares it against
poppler's own render. It uses no fixed similarity threshold: font substitution and
antialiasing differ per platform, and on this fixture two different pages are only ~0.11
RMSE apart, so any fixed limit loose enough to pass would also pass a viewer showing the
wrong page. Instead it requires the painted page to be at least twice as close to page 1
as page 2 is — a relative test that holds anywhere. Observed here: 0.036 against 0.116.

The rendering checks exist because pdfium both writes the annotation and reads it back,
so "pdfium can see it" says nothing about the recipient. poppler and Ghostscript share no
code with pdfium; when both place the mark within ~18 px of where it was drawn, the
annotation is in the file in a standard-conforming way.

`complex.pdf` embeds its CJK font with `subset: false`. pdf-lib's CFF subsetter produces a
font poppler and Ghostscript refuse to rasterise, and a fixture other engines cannot draw
cannot detect the app corrupting it. The 4 MB cost is worth the fixture being valid.

### What the real-runtime suite adds

`apps/desktop/e2e-tauri/run.mjs` runs the actual binary, so it covers what a stubbed
Chromium run cannot: the WebKitGTK webview production ships, the Rust plugins, and real
files on disk.

- capability enforcement is real: `/etc/passwd`, out-of-scope writes and `fs.remove` are
  all rejected by the backend, not by a stub
- pdfium renders under WebKit, not just Chromium
- annotate then save mutates the real file, writes `*.iroha-original.pdf`, and the backup
  still hashes to the bytes originally opened
- the saved file on disk carries the annotation in `/Annots` and keeps its CJK and table text

Two things it does not cover. The native file dialog is a portal window under Wayland and
no scripting tool available here can drive it, so the suite opens by path through a
`import.meta.env.DEV` hook. The dialog's own scope grant is likewise emulated, by
`IROHA_E2E_SCOPE`, which `src-tauri/src/lib.rs` honours only under `debug_assertions`.
Scope *denial* is genuinely exercised, which is the half that protects users. Picking a
file through the dialog therefore still needs a human.

### Measured on a developer machine, 2026-07-20

Budgets in `apps/desktop/e2e/performance.spec.ts` are set well above these so ordinary
machine noise does not fail the suite. Update this table when the numbers move.

| Metric | Observed |
|---|---|
| 500-page first page interactive | ~1–2.4 s |
| 500-page live JS heap | ~7 MB (8.3 MB after a deep scroll) |
| 500-page save | ~0.8 s |
| 41.6 MB scan first page interactive | ~2.1 s |
| 41.6 MB scan live JS heap | ~5.2 MB |
| 41.6 MB scan save | ~0.9 s |
| Shipped bundle | 5.96 MB total, 4.42 MB of it pdfium wasm |
| First contentful paint | ~130–230 ms |

Heap is measured over CDP, after a forced collection. `performance.memory` is quantised
and cached for ~30 seconds, so reading it repeatedly in one session returns the same
number regardless of what the app is doing — an earlier version of this table reported
326–468 MB from it and drew a conclusion that turned out to be false. See issue 047.

Real-runtime size ceiling (`npm run e2e:tauri:ceiling`, WebKitGTK against real files):

| File size | First page rendered |
|---|---|
| 41.6 MB | 1.6 s |
| 83.1 MB | 2.0 s |
| 124.7 MB | 2.6 s |
| 166.2 MB | 3.2 s |
| 249.4 MB | 5.3 s |

Roughly linear at ~21 ms/MB, with no failure up to 249 MB. Note the Chromium harness
crashes above ~42 MB because Playwright's route fulfilment holds the whole body in the
browser process; that limit is the harness, not the app, which is why the ceiling is
measured against the real runtime.

## Required fixture set

- 1-page A4 text PDF
- 500-page text PDF
- 300 MB scanned PDF
- encrypted PDF
- malformed but repairable PDF
- rotated pages
- mixed A4/Letter/landscape pages
- CJK embedded font PDF
- form PDF
- annotation-heavy PDF
- transparent PNG and EXIF-rotated JPEG images

Fixtures containing customer data must not be committed.

## Mobile matrix

| Environment | Required checks |
|---|---|
| iPhone current iOS | Files/Drive import, annotation, export, AirPrint, memory warning recovery |
| iPad current iPadOS | split view, rotation, stylus, multi-page navigation |
| Pixel current Android | Drive Document Provider, annotation, print service, background/foreground |
| Low-memory Android | 300 MB PDF, page change, export failure recovery |

## Desktop matrix

| Environment | Required checks |
|---|---|
| Windows 11 x64 | open, tabs, annotation, export, print, installer |
| macOS Apple Silicon | notarized build, open, annotation, print |
| Ubuntu LTS | AppImage/deb, file chooser, export, print |

## Pass/fail examples

- Original PDF checksum never changes unless user explicitly chooses overwrite.
- Annotation autosave survives force close.
- Exported PDF opens in Apple Preview, Chrome, Acrobat Reader, and Google Drive viewer.
- Reordering rejects out-of-range pages without producing a file.
- Google Drive conflict never silently overwrites both modified versions.
- 500-page PDF first page becomes interactive before all pages render.
- App does not log OAuth token, file content, note content, or local path in production.

## Evidence

- automated test output
- screen recording for open/edit/export/reopen
- before/after SHA-256
- before/after file size
- peak RSS / Android memory / Xcode memory graph
- exported fixture files
- Drive revision IDs and conflict screenshots
