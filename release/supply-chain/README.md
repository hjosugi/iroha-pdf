# Supply-chain checks

CI installs dependencies only from `package-lock.json` and `Cargo.lock`, then runs three independent gates:

- `npm audit --audit-level=high` and pinned `cargo-audit 0.22.2` reject known high/critical npm advisories and RustSec advisories.
- `npm run sbom:npm` uses pinned `@cyclonedx/cyclonedx-npm 6.0.0` with reproducible output; pinned `cargo-cyclonedx 0.5.9` emits the Rust SBOM. Both are CycloneDX JSON artifacts.
- `npm run audit:licenses:npm` evaluates SPDX AND/OR expressions against the allowlist and records every GPL/AGPL/LGPL/SSPL alternative. `cargo-deny 0.20.2` applies the Rust allowlist in `deny.toml`. A copyleft-only or conjunctive copyleft requirement fails the build.

Generated evidence is written under `artifacts/` and retained by CI for 90 days. Run the npm checks locally with:

```sh
npm ci
npm audit --audit-level=high
npm run sbom:npm
npm run audit:licenses:npm
```

Run the Rust checks with the exact tool versions used in CI:

```sh
cargo install --locked cargo-audit --version 0.22.2
cargo install --locked cargo-cyclonedx --version 0.5.9
cargo install --locked cargo-deny --version 0.20.2
cargo audit --file apps/desktop/src-tauri/Cargo.lock
cargo deny --manifest-path apps/desktop/src-tauri/Cargo.toml check --config release/supply-chain/deny.toml licenses
cargo cyclonedx --manifest-path apps/desktop/src-tauri/Cargo.toml --format json --spec-version 1.5
```

Allowlist additions require a review of the exact SPDX terms and why distribution is compatible with Apache-2.0. Never add a package-specific exception solely to make CI pass. Upgrade or replace vulnerable dependencies; any temporary advisory exception must identify the advisory, affected path, compensating control, owner, and expiry date in the same review.
