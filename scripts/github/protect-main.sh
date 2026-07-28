#!/usr/bin/env bash

set -euo pipefail

readonly expected_repository="hjosugi/iroha-pdf"
readonly branch="main"
readonly github_actions_app_id=15368
readonly apply="${APPLY:-0}"

for executable in gh git jq; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    printf 'error: required executable not found: %s\n' "$executable" >&2
    exit 1
  fi
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'error: run this command from the iroha-pdf Git worktree\n' >&2
  exit 1
fi

repository="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
if [[ "$repository" != "$expected_repository" ]]; then
  printf 'error: refusing to update %s; expected %s\n' \
    "$repository" "$expected_repository" >&2
  exit 1
fi

default_branch="$(
  gh repo view --json defaultBranchRef --jq .defaultBranchRef.name
)"
if [[ "$default_branch" != "$branch" ]]; then
  printf 'error: refusing to update %s; default branch is %s\n' \
    "$branch" "$default_branch" >&2
  exit 1
fi

required_checks=(
  "Quality and Expo validation"
  "Supply-chain policy"
  "Tauri (ubuntu-latest)"
  "Tauri (macos-latest)"
  "Tauri (windows-latest)"
  "e2e (ubuntu-latest)"
  "e2e (macos-latest)"
  "e2e (windows-latest)"
)

checks_json="$(
  printf '%s\n' "${required_checks[@]}" |
    jq --argjson app_id "$github_actions_app_id" \
      --raw-input '{context: ., app_id: $app_id}' |
    jq --slurp .
)"

payload="$(
  jq --null-input \
    --argjson checks "$checks_json" \
    '{
      required_status_checks: {
        strict: true,
        contexts: [],
        checks: $checks
      },
      enforce_admins: true,
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
        required_approving_review_count: 0,
        require_last_push_approval: false
      },
      restrictions: null,
      required_linear_history: true,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: true,
      lock_branch: false,
      allow_fork_syncing: false
    }'
)"

printf 'Target: %s branch %s\n' "$repository" "$branch"
printf '%s\n' "$payload" | jq .

if [[ "$apply" != "1" ]]; then
  printf '%s\n' \
    'Dry run only. Re-run with APPLY=1 after reviewing the target and payload.'
  exit 0
fi

printf '%s\n' "$payload" |
  gh api \
    --method PUT \
    "repos/${repository}/branches/${branch}/protection" \
    --input - >/dev/null

protection="$(
  gh api "repos/${repository}/branches/${branch}/protection"
)"

if ! jq --exit-status \
  --argjson expected_checks "$checks_json" \
  '
    .required_status_checks.strict == true
    and (
      [.required_status_checks.checks[] | {context, app_id}] | sort_by(.context)
    ) == ($expected_checks | sort_by(.context))
    and .enforce_admins.enabled == true
    and .required_pull_request_reviews.required_approving_review_count == 0
    and .required_linear_history.enabled == true
    and .allow_force_pushes.enabled == false
    and .allow_deletions.enabled == false
    and .required_conversation_resolution.enabled == true
  ' <<<"$protection" >/dev/null; then
  printf 'error: GitHub returned protection settings that differ from policy\n' >&2
  printf '%s\n' "$protection" | jq . >&2
  exit 1
fi

printf 'Verified main protection for %s.\n' "$repository"
