# Store submission assets

This directory is the source of truth for the public App Store and Google Play
listing inputs. It contains only public copy and synthetic artwork. Never put a
customer PDF, account name, local path, OAuth response, or production Drive
content here.

## Submission set

| Store field | Source |
|---|---|
| App Store English (U.S.) copy | `listing/en-US.json` → `appStore` |
| App Store Japanese copy | `listing/ja-JP.json` → `appStore` |
| Google Play English (U.S.) copy | `listing/en-US.json` → `googlePlay` |
| Google Play Japanese copy | `listing/ja-JP.json` → `googlePlay` |
| Play icon and feature graphic | `play/` |
| Play phone screenshots | `screenshots/android-phone/` |
| App Store 6.9-inch screenshots | `screenshots/ios-iphone-6.9/` |
| App Store 13-inch iPad screenshots | `screenshots/ios-ipad-13/` |
| Device, source commit, and run evidence | `screenshots/evidence.json` |

The four screenshot scenes are deliberately ordered: library and search,
annotation and export, on-device page tools, then the limited Google Drive
permission explanation. The first two therefore communicate the primary value
even on store surfaces that show only the first screenshots.

The `en-US` and `ja-JP` listings use the same product-accurate screenshots. The
current mobile interface is English; a Japanese description must not be paired
with invented Japanese UI that the shipped app does not provide. Add a separate
Japanese screenshot set only after the app itself ships Japanese localization.

## Reproduce the screenshots

`Store screenshots` is a manually dispatched workflow because native simulator
builds are expensive and a screenshot changes only when a release-facing screen
changes. It builds installable native release configurations with
`EXPO_PUBLIC_STORE_SCREENSHOTS=1`. That flag exposes an unlinked seed route which
loads `apps/mobile/assets/store/iroha-demo.pdf`, creates fixed local records, and
then redirects to the ordinary production screen. Without the flag the route
redirects home and cannot seed anything.

The Android job captures a 1080x1920 Pixel 6 AVD. The macOS job captures the
accepted native canvases from an iPhone 16 Pro Max Simulator (1320x2868) and an
iPad Pro 13-inch M4 Simulator (2064x2752). Every raw simulator image is converted
to an opaque 24-bit RGB PNG; transparency is rejected by both store workflows.

Run and retrieve it from a pushed branch:

```sh
gh workflow run store-screenshots.yml --ref "$(git branch --show-current)"
gh run list --workflow store-screenshots.yml --branch "$(git branch --show-current)" --limit 1
gh run download RUN_ID --name store-submission-screenshots --dir /tmp/iroha-store-screenshots
```

Copy the downloaded `screenshots/` contents into `release/store/screenshots/`,
review every image at full size, and run:

```sh
npm run verify:store:fixture
npm run validate:store
```

`validate:store` enforces copy limits, HTTPS URLs, alt-text coverage, exact
dimensions, opaque RGB encoding, Play's size/aspect constraints, unique image
content, and provenance. `task ci` runs the same gate through Frost.

## Current official constraints

Checked on 2026-08-01:

- Apple accepts one to ten screenshots without transparency. A 6.9-inch iPhone
  set is the primary phone set; a 13-inch iPad set is required when the app runs
  on iPad: <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>
- Google Play requires a 512x512 icon, an opaque 1024x500 feature graphic, and at
  least two screenshots. Its large-screen recommendation calls for at least four
  9:16 or 16:9 screenshots: <https://support.google.com/googleplay/android-developer/answer/9866151>
- App Store name/subtitle limits are 30 characters, and version metadata limits
  promotional text to 170 characters, description to 4,000, and keywords to 100
  bytes: <https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/>
- Play limits the app name to 30 characters, short description to 80, and full
  description to 4,000: <https://support.google.com/googleplay/android-developer/answer/9859152>
