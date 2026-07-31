# Build workflow

The repository uses two complementary tools:

- [Task](https://taskfile.dev/) v3.52.0 is the cross-platform developer and CI
  entry point.
- [FrostBuild](https://github.com/hjosugi/frost-build) v0.8.0 owns the
  incremental validation graph and the desktop Vite output tree.

npm remains authoritative for the lockfile, dependency installation, Vitest,
TypeScript and Vite. Frost operates above those package-manager boundaries: it
prunes unaffected workspace gates, caches successful tests, and restores the
verified profile-specific tree below `apps/desktop/dist/`.

The release-facing validation scripts — EAS profiles, brand assets and the
vendored dependency patches — are Frost `test` targets rather than bare npm
calls, so they are pruned and cached like every other gate. They read
checked-in configuration and assets, so each one declares those files as
inputs: editing `apps/mobile/app.json` reruns the brand gate and nothing else.

## Install the tools

Install Task with any official method. A version-pinned Go installation is:

```bash
go install github.com/go-task/task/v3/cmd/task@v3.52.0
```

Install FrostBuild v0.8.0 from its
[checksummed release](https://github.com/hjosugi/frost-build/releases/tag/v0.8.0)
and place `frost` on `PATH`. No Frost binary is committed to this repository.

Verify both tools:

```bash
task --version
frost --version
task frost:doctor
```

Every Frost task refuses a binary whose `frost info version` is not the pinned
`0.8.0`, which is the version CI installs from that checksummed archive. Frost
is pre-1.0 and states that a minor release may change manifest or CLI
semantics, so a local run against a different binary would not mean the same
thing as the CI run. Raise `FROST_VERSION` in `Taskfile.yml` and the archive
URL plus SHA-256 in `.github/workflows/ci.yml` together.

## Common commands

```bash
task install          # npm ci
task check            # every cached gate: tests, typechecks, release validation
task test             # cached unit tests only
task typecheck        # cached typechecks only
task build:desktop    # cached/restorable Vite dist tree
task validate         # EAS, product-identity and dependency-patch validation
task ci               # the complete fast CI quality workflow
```

`FROST_BIN=/absolute/path/to/frost task check` selects a binary that is not on
the normal `PATH`.

## Cutting a release

Bump every version marker — `package.json`, both app manifests,
`apps/mobile/app.json`, `apps/desktop/src-tauri/tauri.conf.json` and
`Cargo.toml`, plus both lockfiles — add the `## X.Y.Z - YYYY-MM-DD` heading to
`CHANGELOG.md`, and merge that to `main`. Then run the **Release** workflow
from the Actions tab with the same version.

The workflow checks the version against every one of those files and against
the changelog heading before it creates anything, then creates the tag and the
GitHub release in one step, so a failed check cannot leave a dangling tag. Its
notes are the changelog section for that version.

It attaches no binaries, and defaults to marking the release as a pre-release.
Desktop signing and notarization are unimplemented and `docs/RELEASE_GATE.md`
is still blocked, so an attached artifact would be an unsigned build wearing a
release badge. Turn the pre-release flag off once that gate is met.

Frost keeps its journal, graph and content-addressed cache below `.frost/`.
Delete that directory only when intentionally discarding the local build cache;
correctness does not depend on the cache being present.
