# Supply-chain checks

CI installs dependencies only from `package-lock.json` and `Cargo.lock`, then runs three independent gates:

- `npm audit --omit=optional --audit-level=moderate` rejects known
  moderate-or-higher advisories in the installed product graph. Pinned
  `cargo-audit 0.22.2` rejects RustSec advisories.
- `npm run sbom:npm` uses pinned `@cyclonedx/cyclonedx-npm 6.0.0` with reproducible output; pinned `cargo-cyclonedx 0.5.9` emits the Rust SBOM. Both are CycloneDX JSON artifacts.
- `npm run audit:licenses:npm` evaluates SPDX AND/OR expressions against the allowlist and records every GPL/AGPL/LGPL/SSPL alternative. `cargo-deny 0.20.2` applies the Rust allowlist in `deny.toml`. A copyleft-only or conjunctive copyleft requirement fails the build.

Generated evidence is written under `artifacts/` and retained by CI for 90 days. Run the npm checks locally with:

```sh
npm ci
npm run verify:dependency-patches
npm audit --omit=optional --audit-level=moderate
npm run sbom:npm
npm run audit:licenses:npm
```

Run the Rust checks with the exact tool versions used in CI:

```sh
cargo install --locked cargo-audit --version 0.22.2
cargo install --locked cargo-cyclonedx --version 0.5.9
cargo install --locked cargo-deny --version 0.20.2
cargo audit --file apps/desktop/src-tauri/Cargo.lock
cargo deny --manifest-path apps/desktop/src-tauri/Cargo.toml --config release/supply-chain/deny.toml check licenses
cargo cyclonedx --manifest-path apps/desktop/src-tauri/Cargo.toml --format json --spec-version 1.5
```

Allowlist additions require a review of the exact SPDX terms and why distribution is compatible with Apache-2.0. Never add a package-specific exception solely to make CI pass. Upgrade or replace vulnerable dependencies; any temporary advisory exception must identify the advisory, affected path, compensating control, owner, and expiry date in the same review.

## Temporary patched dependencies

`xcode` 3.0.1 still declares `uuid ^7.0.3`, so the root npm override replaces
the sole transitive `uuid` instance with the CommonJS-compatible, patched
11.1.1 release. `xcode` is also pinned as a root build-time dependency so npm
applies the root override to the workspace dependency graph and deduplicates
Expo's instance. The verification script exercises `xcode` UUID generation and
checks the resolved version.

Tauri's Linux GTK3 dependency chain requires `glib` 0.18.5, but the first
release identified as fixed for RUSTSEC-2024-0429 is 0.20.0. The project
therefore uses the published 0.18.5 source with the upstream two-line
`VariantStrIter` fix backported. Its source, registry checksum, owner, removal
condition, and 2026-10-31 re-review date are recorded in
`apps/desktop/src-tauri/vendor/glib-0.18.5-patched/PROVENANCE.md`.

`react-native-pdf` 7.0.4 is patched on Android and iOS to report each current
page's dimensions, which keeps mixed-size-page annotation coordinates aligned.
React Native 0.86.2 is patched separately so Android pen events preserve the
normalized `MotionEvent` pressure instead of substituting `0.5`. Expo prebuild
adds the patched React Native tree as a Gradle composite build and explicitly
substitutes its `ReactAndroid` and `hermes-engine` projects for `react-android` and
`hermes-android`; without those rules, Gradle either consumes the unmodified React
Android AAR or mixes source ReactAndroid with a duplicate published Hermes class.
Legacy `react-native` and `hermes-engine` Maven requests are substituted directly
as well, because a later coordinate rewrite would otherwise reintroduce the
published AAR beside the source project. CI checks the installed sources,
committed patch files, generated Gradle setting
and both `dependencyInsight` outputs, while the manual native instrumentation
rejects a fixed-pressure SQLite payload.
Upgrade either dependency only after refreshing or removing its patch and
rerunning the native evidence gate.
