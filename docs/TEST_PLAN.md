# Test plan

## Automated

```bash
npm test
npm run typecheck
npm run build:desktop
```

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
