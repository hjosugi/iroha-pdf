# Store privacy declaration checklist

This is a release input, not a substitute for reviewing the exact signed
binary in App Store Connect and Play Console.

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
  and Drive/appData deletion as described in `PRIVACY_POLICY.md`.

## Apple submission

- [x] App-level privacy manifest declares no tracking or app-level collected
  data; Expo/native dependency manifests are merged during prebuild.
- [ ] Run a clean iOS prebuild/archive and inspect the merged
  `PrivacyInfo.xcprivacy` files for every bundled SDK.
- [ ] Submit to TestFlight and resolve any required-reason API report.
- [ ] Enter App Privacy answers from the exact release binary and optional
  Drive behavior.
- [ ] Publish a stable HTTPS rendering of `PRIVACY_POLICY.md` and enter its URL.
- [ ] Verify camera/photo/file usage descriptions against enabled features.

## Google Play submission

- [ ] Inspect the merged Android manifest; confirm broad
  `MANAGE_EXTERNAL_STORAGE` is absent and only feature-required permissions
  remain.
- [ ] Review every bundled SDK in the Google Play SDK Index.
- [ ] Complete Data safety using the current implementation declaration above;
  explicitly evaluate user-initiated Drive transfers under current Play rules.
- [ ] Publish the same stable HTTPS privacy-policy URL in Play Console and in
  the app.
- [ ] Exercise sign-out, OAuth revocation, local deletion, Drive deletion, and
  appData deletion on a production-like account.

## OAuth verification

- [ ] Consent screen shows the same product name, policy URL, and support link.
- [ ] Only `drive.file` and `drive.appdata` scopes are requested.
- [ ] iOS bundle ID, Android package/SHA certificates, and desktop redirect
  URIs match release artifacts.
- [ ] A reviewer can test connect, sync, disconnect, revoke, and reauthorize.

