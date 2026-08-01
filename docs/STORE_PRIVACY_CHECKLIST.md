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

The page is live only once an owner has enabled GitHub Pages for this
repository with **Source: GitHub Actions** (Settings → Pages). Until then the
URL returns 404 and the two submission checkboxes that depend on it stay open.
Tracked in issue #67.

## Current implementation declaration

- Tracking: no.
- Advertising/analytics SDK: none.
- Developer collection of documents, notes, annotations, identifiers, crash
  logs, or diagnostics: none in the current build.
- On-device PDF/note processing: not off-device collection.
- Optional Google Drive transfer: user initiated, direct to Google, for app
  functionality; includes selected files, Drive identifiers/revisions, and
  appData synchronization metadata.
- Encryption in transit: yes for Google OAuth and Drive HTTPS endpoints.
- Deletion: local app-data deletion plus separate Google sign-out/revocation
  and Drive/appData deletion as described in
  [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md).

## Apple submission

- [x] App-level privacy manifest declares no tracking or app-level collected
  data; Expo/native dependency manifests are merged during prebuild.
- [ ] Run a clean iOS prebuild/archive and inspect the merged
  `PrivacyInfo.xcprivacy` files for every bundled SDK.
- [ ] Submit to TestFlight and resolve any required-reason API report.
- [ ] Enter App Privacy answers from the exact release binary and optional
  Drive behavior.
- [ ] Enable GitHub Pages (Source: GitHub Actions), confirm
  https://hjosugi.github.io/iroha-pdf/privacy/ returns 200, and enter that URL
  as the App Privacy policy URL.
- [ ] Verify camera/photo/file usage descriptions against enabled features.

## Google Play submission

- [ ] Inspect the merged Android manifest; confirm broad
  `MANAGE_EXTERNAL_STORAGE` is absent and only feature-required permissions
  remain.
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
