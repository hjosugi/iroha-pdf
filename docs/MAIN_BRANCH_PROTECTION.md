# Main branch protection

Issue #62 established the requirement that pull requests and successful CI
checks protect `main`; it was closed after the live GitHub API read-back matched
the encoded policy on 2026-08-02. The CI workflow runs on pull requests and
retains quality and native build artifacts for 14 days and supply-chain evidence
for 90 days.

The repository policy is encoded in `scripts/github/protect-main.sh`. It:

- refuses to operate outside `hjosugi/iroha-pdf`;
- refuses to protect any branch other than the repository's default `main`;
- requires pull requests while allowing a solo maintainer to merge without a
  separate approval;
- requires branches to be current with `main`;
- requires the eight CI jobs that run on pull requests;
- applies the policy to administrators;
- requires linear history and resolved conversations; and
- disables force pushes and branch deletion.

The Android APK job is intentionally excluded from required pull-request
checks because `.github/workflows/ci.yml` runs that cold build only after a
push to `main` or a manual workflow dispatch.

## Preview

Install and authenticate the GitHub CLI, then inspect the exact target and API
payload without changing repository settings:

```sh
scripts/github/protect-main.sh
```

## Apply and verify

Run the mutating form only after confirming that the preview targets
`hjosugi/iroha-pdf` and branch `main`:

```sh
APPLY=1 scripts/github/protect-main.sh
```

The command reads the settings back from GitHub and fails unless the required
checks and protection flags exactly match the encoded policy.
