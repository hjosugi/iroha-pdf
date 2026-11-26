# Iroha PDF

[日本語](README.md) | English

A lightweight, local-first PDF workspace. Its iOS, Android, Windows, macOS, and Linux interfaces share PDF operations, annotations, notes, and synchronization data models.

`Iroha PDF` is an open-source engineering preview that processes PDFs on mobile and desktop devices. Consumer-ready signing, physical-device qualification, performance qualification, production OAuth, and store review are not complete.

The public name is `Iroha PDF` and the repository is `iroha-pdf`. The earlier candidate `abc-pdf` was rejected because it was too close to the existing commercial ABCpdf product and similarly named GitHub repositories.

## Current release status

- The newest release is `0.12.0`. Desktop AppImage, deb, rpm, dmg, msi and NSIS setup artifacts are on [GitHub Releases](https://github.com/hjosugi/iroha-pdf/releases/latest), but Windows signing and macOS notarization are not implemented.
- Android, iPhone, and iPad release configurations have started and rendered in simulators or emulators. This is not evidence of installing a signed production build on a physical device.
- App Store and Google Play listing copy and images are present and validated in the repository. TestFlight, Play closed testing, store declarations, and review have not been performed.
- Google Drive includes a REST client and a mobile list/download screen. Production OAuth, mobile upload UI, cross-device synchronization, conflict resolution, and release qualification remain incomplete.
- [docs/RELEASE_GATE.md](docs/RELEASE_GATE.md) is the source of truth for release readiness. The gate is currently **blocked**.
- [docs/RELEASE.md](docs/RELEASE.md) is the runbook for cutting a release, publishing the site, and submitting to the stores. It is written in Japanese; [docs/BUILD.md](docs/BUILD.md#cutting-a-release) has the outline in English.

## Install

Desktop builds are published on [GitHub Releases](https://github.com/hjosugi/iroha-pdf/releases/latest).

- Linux: `Iroha-PDF_0.12.0_amd64.AppImage`, `.deb`, `.rpm`
- macOS: `Iroha-PDF_0.12.0_universal.dmg`
- Windows: `Iroha-PDF_0.12.0_x64_en-US.msi`, `Iroha-PDF_0.12.0_x64-setup.exe`

On Linux, [Soar](https://soar.qaidvoid.dev/) can install the AppImage directly:

```bash
soar install https://github.com/hjosugi/iroha-pdf/releases/download/v0.12.0/Iroha-PDF_0.12.0_amd64.AppImage
```

To follow the latest release, add this to `~/.config/soar/packages.toml`:

```toml
[packages.iroha-pdf]
github = "hjosugi/iroha-pdf"
asset_pattern = "Iroha-PDF_*_amd64.AppImage"
tag_pattern = "v*"
```

```bash
soar apply
```

The AppImage may need FUSE. The packages are unsigned, so the first launch still meets Gatekeeper or SmartScreen warnings. `SHA256SUMS` lets you check the bytes CI built; it is not a signature.

## Implemented

- Expo SDK 57, React Native 0.86.2, and React 19.2.3 mobile foundation. Expo-compatible mobile and shared packages use TypeScript 6.0.3.
- Tauri 2, React 19.2.8, and EmbedPDF (PDFium/WASM) desktop foundation. Desktop and root tooling use TypeScript 7.0.2.
- PDF viewing, multiple tabs, highlights, pressure-aware stylus ink, and text annotations.
- Lightweight per-PDF notes with automatic saving; desktop notes live in an app-data write-ahead journal, survive site-data clearing, and offer an interrupted write back.
- Export of a copy with annotations embedded into the PDF.
- Desktop save and save-as for the opened PDF, confirmation before the first overwrite, a visible save failure with Retry, a pristine backup, edit history, recovery of unsaved drafts, and restore of any saved revision.
- PDF creation from images, including large-image downscaling, JPEG compression, and A4 placement.
- Page reordering, duplication, merging, extraction, deletion, and rotation.
- Desktop AcroForm filling (text, checkbox, radio, choice), blank-page preview and removal, and note links to text selections that jump to the page and rectangle.
- Desktop N-up (2 or 4 pages), saddle-stitch booklet in duplex order, poster tiling, and printing the produced document.
- Full-text search of the open document and its linked note, with page jumps (one document at a time).
- Desktop confirmation before a link inside a PDF is opened: only `http`, `https`, `mailto`, and `tel` are accepted, and the exact URL is shown first.
- Desktop print preview for all/current/custom pages with optional annotations, plus native iOS and Android print dialogs.
- Safe structural PDF optimization.
- SQLite persistence for PDFs, notes, and annotations.
- Google Drive REST client:
  - least-privilege `drive.file` and `drive.appdata` scopes;
  - listing, download, create/update, and resumable upload APIs;
  - Changes API start tokens and incremental change retrieval.
- Google Drive mobile list/download screen after OAuth client configuration.
- Japanese and English UI, screen-reader labels, and mobile targets of at least 44 React Native logical units.
- CSS custom properties for desktop/site sizing and typed mobile size tokens, with a Frost gate that rejects newly scattered fixed sizes.
- Annotation coordinates normalized to each page's actual geometry, recalculation for mixed sizes and rotation, and a safe return to 100% zoom while editing.
- An evidence gate that opens, critically trims, resumes, and cold-reopens a 300 MiB, 500-page PDF on a 1.5 GiB Android AVD.
- Local PDF and note deletion, Google Drive logout, and permission revocation.
- Unit tests for annotation coordinates, PDF operations, and synchronization merges.

## Important limitations

- Replacing existing PDF text in place is intentionally outside the minimum editing scope. It requires rebuilding fonts, glyph placement, subsets, and content streams and is too fragile for this MVP. The MVP supports additions, highlights, handwriting, notes, and page operations.
- Safe mobile optimization only rebuilds object streams. It does not recompress images, so some PDFs will not become smaller.
- Mobile annotation export creates a separate copy and does not overwrite the provider original. A provider bridge for safely saving back to that file is not implemented.
- Mobile annotation export and printing rebuild the complete PDF in JavaScript memory. Inputs over 64 MiB are rejected with guidance to use the desktop app, avoiding a forced process termination. Native viewing and annotation autosave remain available.
- Search covers the open document and its note. A cross-library index is not implemented. The booklet layout assumes duplex printing; the printer's duplex setting is the operator's.
- High compression, deskew, OCR, PDF/A, and font outlining require native engines. They are tracked as a desktop `pdfcpu` sidecar and dedicated mobile native modules.
- Google Drive authentication requires iOS, Android, and Web OAuth clients in Google Cloud Console, followed by regeneration of the development build.
- Drive upload APIs exist at the client layer. The mobile upload UI, production-account validation, cross-device sync, offline queue, and PDF conflict-resolution UI are incomplete.
- Mobile PDF rendering uses `react-native-pdf`, so it does not run in Expo Go. Use a development build.
- Android emulator gates exercise synthetic stylus input and constrained memory. Apple Pencil and vendor pens, printing, rotation, battery behavior, and recovery after an OS process kill remain unverified on physical iPhone, iPad, and Android devices.
- Desktop distributions are unsigned. They are not consumer-ready packages that avoid Gatekeeper or SmartScreen warnings.

## Repository layout

```text
apps/
  mobile/          Expo / React Native
  desktop/         Tauri / React / EmbedPDF
packages/
  core/            PDF operations, annotations, and synchronization domain
  google-drive/    Google Drive API client
docs/
  ARCHITECTURE.md
  GOOGLE_DRIVE.md
  RELEASE.md       Release runbook (Japanese)
  REPOSITORY_RESEARCH.md
  TEST_PLAN.md
site/
  build.mjs        Dependency-free generator that publishes docs through GitHub Pages
issues/
  ISSUES.md
```

## Documentation

GitHub Pages publishes the repository's documentation. The [Pages workflow](https://github.com/hjosugi/iroha-pdf/blob/main/.github/workflows/pages.yml) rebuilds it after every push to `main`.

- Documentation site: https://hjosugi.github.io/iroha-pdf/
- English overview: https://hjosugi.github.io/iroha-pdf/overview-en/
- Stable privacy-policy URL for store listings and the OAuth consent screen: https://hjosugi.github.io/iroha-pdf/privacy/
- Release runbook for the desktop release, the site, and store submission (Japanese): [docs/RELEASE.md](docs/RELEASE.md)
- App Store and Google Play copy, images, and regeneration instructions: [release/store/README.md](release/store/README.md)
- Screen-by-screen UI/UX audit, fixes, and remaining physical-device gates: [docs/UI_UX_AUDIT.md](docs/UI_UX_AUDIT.md)

Run `npm run site` to build the site locally, then serve `site/dist/` as static files. See [docs/STORE_PRIVACY_CHECKLIST.md](docs/STORE_PRIVACY_CHECKLIST.md) for public URLs and submission checks.

## Setup

Node.js 22.13 or later and FrostBuild v0.15.0 are required. The former Taskfile has been removed: local and CI incremental tests, type checks, validations, and desktop builds are defined in `frost.toml`. Native desktop builds also require Rust and Tauri's operating-system-specific prerequisites.

```bash
npm ci
frost test --all --no-tui
frost build desktop-web --no-tui
```

See [docs/BUILD.md](docs/BUILD.md) for pinned tool versions, installation instructions, and the division of responsibility between FrostBuild and npm.

### Mobile

```bash
npm run dev:mobile
```

Create a development build the first time:

```bash
cd apps/mobile
npx expo prebuild
npx expo run:android
# macOS only
npx expo run:ios
```

### Desktop web UI

```bash
npm run dev:desktop:web
```

### Tauri desktop

```bash
npm run dev:desktop
```

## Google Drive configuration

```bash
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

See [docs/GOOGLE_DRIVE.md](docs/GOOGLE_DRIVE.md) for details.

## Continuing implementation

[issues/ISSUES.md](issues/ISSUES.md) mirrors the initial backlog and verification records in the repository. Check [GitHub Issues](https://github.com/hjosugi/iroha-pdf/issues) for current status and priority, and work from `P0` downward.

## Key technical decisions

- The React Native documentation recommends a framework such as Expo for new applications. Expo SDK 57 uses the React Native 0.86 line, and this repository pins 0.86.2.
- EmbedPDF was selected for the desktop PDF engine because it is MIT-licensed and provides PDFium plus annotation, printing, and export plugins.
- Pedaru informed the Google Drive, SQLite, tab, and session designs. It was not ported because it is desktop-only and does not write PDFs.
- BentoPDF is an excellent functional reference, but it uses AGPL-3.0 or a commercial dual license. No BentoPDF code was copied into this project.

## License

Apache-2.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party components.
