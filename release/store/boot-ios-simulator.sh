#!/usr/bin/env bash
set -euo pipefail

udid="${1:?usage: boot-ios-simulator.sh UDID}"
attempts=3
polls_per_attempt=90
log="${RUNNER_TEMP:-/tmp}/iroha-simulator-${udid}.log"

command -v xcrun >/dev/null

for attempt in $(seq 1 "$attempts"); do
  xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true
  : > "$log"
  xcrun simctl bootstatus "$udid" -b > "$log" 2>&1 &
  boot_pid=$!

  for _ in $(seq 1 "$polls_per_attempt"); do
    if ! kill -0 "$boot_pid" 2>/dev/null; then
      if wait "$boot_pid"; then
        cat "$log"
        printf 'simulator %s booted on attempt %s\n' "$udid" "$attempt"
        exit 0
      fi
      break
    fi
    sleep 2
  done

  if kill -0 "$boot_pid" 2>/dev/null; then
    kill "$boot_pid" >/dev/null 2>&1 || true
    wait "$boot_pid" >/dev/null 2>&1 || true
  fi
  printf 'simulator %s did not boot on attempt %s/%s\n' "$udid" "$attempt" "$attempts" >&2
  cat "$log" >&2
done

xcrun simctl list devices >&2
exit 1
