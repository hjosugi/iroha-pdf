# Mobile release runbook

All commands run from `apps/mobile`. Use the pinned CLI (`npx eas-cli@20.5.1`) so local and CI behavior is reviewable.

## One-time setup and signing

1. Run `npx eas-cli@20.5.1 init` and commit the generated EAS project ID in Expo config.
2. Run `npx eas-cli@20.5.1 credentials --platform android` and `--platform ios`. Keep `credentialsSource: remote`; never commit keystores, provisioning profiles, certificates, API keys, or `credentials.json`.
3. Give release automation a least-privilege `EXPO_TOKEN` through the CI environment, not a repository file. Store Google service-account and App Store Connect keys in EAS or the store integration.
4. Create variables separately with `eas env:create --environment development|preview|production`. Use `secret` visibility for server-only credentials, `sensitive` where local config resolution must read a value, and `plaintext` only for non-secret client values. Anything prefixed `EXPO_PUBLIC_` is readable by app users.
5. Verify names and visibility without printing values: `eas env:list --environment <environment>`.

## Build and promote

| Profile | Distribution | EAS environment | Purpose |
| --- | --- | --- | --- |
| `development` | Internal development client | `development` | Developer devices |
| `preview` | Internal APK/ad hoc build | `preview` | QA and release candidate |
| `production` | Store-signed binary | `production` | App Store / Play Store |

Build with `eas build --profile <profile> --platform android|ios`. Test the exact preview commit before building production. Production versions auto-increment remotely; submit only the build ID approved in the release record with `eas submit --profile production --id <build-id>`.

Before production, record the git commit, EAS build IDs, resolved environment, tester approval, and store release IDs. Confirm no preview variables appear in production config and download/install the signed artifact on a clean device.

## Rollback drill

1. Stop a staged store rollout first. Do not submit another untested artifact.
2. Check out the last known-good signed commit, rebuild with the `production` profile (remote auto-increment keeps store versions valid), test it on a clean device, then submit that new build ID.
3. If EAS Update is configured, use `eas update:rollback`, select the `production` branch/channel, verify the target runtime and update group, then confirm on a production build. EAS Update cannot roll back native-code or runtime-version changes; use the store rebuild above.
4. Verify rollback on both platforms, record affected versions and timestamps, and retain the incident evidence.

Run this drill against `preview` before the first store release and after any signing, channel, runtime-version, or release-owner change.
