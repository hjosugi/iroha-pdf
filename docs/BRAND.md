# Iroha PDF brand assets

The product mark is the hiragana `い`: a small reference to the first character
of *iroha* and a shape that remains legible at favicon and toolbar sizes. The
master artwork is deliberately flat, geometric, and text-free so every generated
icon has the same silhouette and does not depend on an installed font.

## Source of truth

- `assets/branding/iroha-icon.svg`: full blue app icon
- `assets/branding/iroha-foreground.svg`: transparent white adaptive foreground
- `assets/branding/iroha-monochrome.svg`: Android themed-icon mask
- `assets/branding/iroha-splash.svg`: blue mark on a transparent splash canvas
- `assets/branding/iroha-feature-graphic.svg`: Google Play 1024x500 artwork
- `assets/branding/tauri-icon-manifest.json`: Tauri platform generation inputs

Run `npm run brand:generate` after changing any source. Generated PNG, ICNS,
ICO, Android, and iOS files are committed because Expo/Tauri packaging consumes
them directly. Review the 32 px result as well as the master; an icon that works
only at 1024 px is not an application icon.

## Preliminary name search — 2026-07-22

This is an engineering collision check, not legal clearance or a trademark
opinion.

- An exact quoted web search for `"Iroha PDF" app`, and searches constrained to
  Apple App Store and Google Play, found no exact-name PDF application.
- Apple's public Search API returned no result whose `trackName` is exactly
  `Iroha PDF`.
- Searches for the exact phrase in J-PlatPat-, WIPO-, and USPTO-indexed pages
  returned no result.
- RDAP returned `404 Not Found` for both `irohapdf.com` and `irohapdf.app` at the
  time checked. Availability can change at any moment and no domain was
  registered as part of this work.
- `iroha` alone is used by unrelated products and companies, including a
  Japanese consumer brand. The combined name, icon, product category, and final
  store territories still need review by the release owner before publication.

Search endpoints used:

- https://itunes.apple.com/search?term=Iroha%20PDF&entity=software
- https://play.google.com/store/search?q=Iroha%20PDF&c=apps
- https://rdap.org/domain/irohapdf.com
- https://rdap.org/domain/irohapdf.app
- https://www.j-platpat.inpit.go.jp/
- https://branddb.wipo.int/
- https://tmsearch.uspto.gov/

## Store screenshots

Only synthetic fixtures may appear in screenshots. Never use customer PDFs,
account names, local paths, OAuth data, or production Drive contents.

Desktop screenshots live in `release/store/screenshots/desktop/` and are
captured from synthetic fixtures by `npm run store:screenshots:desktop`. The
committed set covers the empty local-first workspace, a PDF with editing tools,
and an unsaved annotation.

Mobile capture is the reproducible native workflow documented in
`release/store/README.md`. It uses one deterministic, synthetic two-page PDF and
the real release-configured screens on Android, iPhone and iPad simulators. It
never stretches a phone image into a tablet result. The committed evidence file
records the device image, exact source commit and GitHub Actions run that created
the submission set.
