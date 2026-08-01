# Store privacy declaration checklist

This is a release input, not a substitute for reviewing the exact signed
binary in App Store Connect and Play Console.

## Published privacy-policy URL

Apple, Google, and OAuth verification each require a policy that is readable
without installing the app, and they must be given the *same* URL: three
separately maintained copies of a privacy policy drift, and a drifted copy is a
false disclosure. So the URL is one HTTPS rendering of the one file in this
repository, [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md), republished by
`.github/workflows/pages.yml` on every push to `main`:

https://hjosugi.github.io/iroha-pdf/privacy/

That address is an interface, not an artifact of the current layout. It is
pinned by the `privacy` slug in `site/catalog.mjs` and does not move when the
document is edited, retitled, or reorganised; changing the slug breaks every
store listing and consent screen that has already been given the URL.

GitHub Pages is enabled with **Source: GitHub Actions**. Both the site root and
the privacy-policy URL returned HTTP 200 on 2026-08-01. Keep the URL in the
two store records even if the documentation layout changes. Tracked in issue
#67.

## Current implementation declaration

- Tracking: no.
- Advertising/analytics SDK: none.
- Developer collection of documents, notes, annotations, identifiers, crash
  logs, or diagnostics: none in the current build.
- On-device PDF/note processing: not off-device collection.
- Optional Google Drive transfer: user initiated, direct to Google, for app
  functionality; the current UI lists app-visible file metadata and downloads
  the selected PDF. It does not currently upload PDFs or appData synchronization
  metadata.
- Encryption in transit: yes for Google OAuth and Drive HTTPS endpoints.
- Deletion: local PDF/note deletion plus Google sign-out/revocation in the app;
  Drive file/appData deletion remains a separate Google-side action as described
  in [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md).

## Store listing assets

What a listing needs, and what this repository actually holds. Brand artwork is
checked by `release/branding/validate-assets.mjs`; localized copy, screenshots,
encoding, dimensions, alt text and capture provenance are checked by
`release/store/validate-submission-assets.mjs`. A missing or wrong-sized asset
therefore fails CI rather than the store console.

| Asset | Required by | Status |
|---|---|---|
| App icon 1024x1024 | both | present — `apps/mobile/assets/images/icon.png` |
| Play listing icon 512x512 | Play | present — `release/store/play/icon-512.png` |
| Play feature graphic 1024x500 | Play, mandatory | present — `release/store/play/feature-graphic.png` |
| Android adaptive + monochrome icons | Play | present — `apps/mobile/assets/images/` |
| Desktop screenshots 1440x900 | neither store | present — 3, `release/store/screenshots/desktop/` |
| Phone screenshots | both, mandatory | present — 4 Android + 4 iPhone, `release/store/screenshots/` |
| iPad / tablet screenshots | App Store (`supportsTablet` is true) | present — 4, `release/store/screenshots/ios-ipad-13/` |
| Localized listing copy | both | present — App Store + Play, `en-US` and `ja-JP` |

- [x] Capture four Android phone scenes at 1080x1920 from a release-configured
  Pixel 6 AVD.
- [x] Capture the same four scenes at Apple's accepted 6.9-inch iPhone size
  (1320x2868) and 13-inch iPad size (2064x2752) from separate native simulators.
- [x] Keep every screenshot synthetic and reproducible. `evidence.json` binds
  the committed set to its source commit, GitHub Actions run, fixture and device
  matrix; no customer file, account or OAuth response is used.
- [x] Draft and validate titles, subtitles/short descriptions, full
  descriptions, keywords, categories, URLs and screenshot alt text in Japanese
  and English under `release/store/listing/`.

## Apple submission

- [x] App-level privacy manifest declares no tracking or app-level collected
  data; Expo/native dependency manifests are merged during prebuild.
- [x] Run a clean iOS prebuild and unsigned Release simulator build. The app
  manifest declares no tracking or collected data, and native dependency
  manifests are included through CocoaPods.
- [ ] Inspect the final signed archive's merged privacy manifests in Xcode
  before upload; simulator success is not archive evidence.
- [ ] Submit to TestFlight and resolve any required-reason API report.
- [ ] Enter App Privacy answers from the exact release binary and optional
  Drive behavior.
- [x] Enable GitHub Pages (Source: GitHub Actions), confirm
  https://hjosugi.github.io/iroha-pdf/privacy/ returns 200, and enter that URL
  as the App Privacy policy URL. The URL is live; entering it in App Store
  Connect remains an owner action.
- [x] Verify camera/photo/file usage descriptions against enabled features.
  Image-to-PDF has a specific photo-library purpose; unused camera, microphone
  and Face ID descriptions are removed at prebuild.

## Google Play submission

- [x] Inspect the merged Android manifest. `MANAGE_EXTERNAL_STORAGE` is absent;
  camera, microphone, dev-overlay and legacy broad read/write storage
  permissions are explicitly removed. Imports use the system document/photo
  providers instead of storage-wide access.
- [ ] Review every bundled SDK in the Google Play SDK Index.
- [ ] Complete Data safety using the current implementation declaration above;
  explicitly evaluate user-initiated Drive transfers under current Play rules.
- [ ] Enter the same https://hjosugi.github.io/iroha-pdf/privacy/ URL in Play
  Console and in the app; Play and App Store Connect must not be given
  different renderings.
- [ ] Exercise sign-out, OAuth revocation, local deletion, Drive deletion, and
  appData deletion on a production-like account.

## OAuth verification

- [ ] Consent screen shows the same product name, policy URL, and support link.
- [ ] Only `drive.file` and `drive.appdata` scopes are requested.
- [ ] iOS bundle ID, Android package/SHA certificates, and desktop redirect
  URIs match release artifacts.
- [ ] A reviewer can test connect, sync, disconnect, revoke, and reauthorize.
