# Build workflow

The repository uses two complementary tools:

- [Task](https://taskfile.dev/) v3.52.0 is the cross-platform developer and CI
  entry point.
- [FrostBuild](https://github.com/hjosugi/frost-build) v0.5.0 owns the
  incremental validation graph and the desktop Vite output tree.

npm remains authoritative for the lockfile, dependency installation, Vitest,
TypeScript and Vite. Frost operates above those package-manager boundaries: it
prunes unaffected workspace gates, caches successful tests, and restores the
verified profile-specific tree below `apps/desktop/dist/`.

## Install the tools

Install Task with any official method. A version-pinned Go installation is:

```bash
go install github.com/go-task/task/v3/cmd/task@v3.52.0
```

Install FrostBuild v0.5.0 from its
[checksummed release](https://github.com/hjosugi/frost-build/releases/tag/v0.5.0)
and place `frost` on `PATH`. No Frost binary is committed to this repository.

Verify both tools:

```bash
task --version
frost --version
task frost:doctor
```

## Common commands

```bash
task install          # npm ci
task check            # cached unit tests and typechecks
task test             # cached unit tests only
task typecheck        # cached typechecks only
task build:desktop    # cached/restorable Vite dist tree
task validate         # EAS and product-identity validation
task ci               # the complete fast CI quality workflow
```

`FROST_BIN=/absolute/path/to/frost task check` selects a binary that is not on
the normal `PATH`.

Frost keeps its journal, graph and content-addressed cache below `.frost/`.
Delete that directory only when intentionally discarding the local build cache;
correctness does not depend on the cache being present.
