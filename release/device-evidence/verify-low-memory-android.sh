#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:?usage: verify-low-memory-android.sh OUTPUT_DIR}"
fixture="${2:?usage: verify-low-memory-android.sh OUTPUT_DIR PDF_FIXTURE}"
package=app.irohapdf.mobile
document_id=device-evidence-large-pdf
port=8765
mkdir -p "$output_dir"

cleanup() {
  [[ -n "${server_pid:-}" ]] && kill "$server_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  adb logcat -d > "$output_dir/logcat.txt" 2>/dev/null || true
  exit 1
}

assert_alive() {
  local pid
  pid="$(adb shell pidof "$package" 2>/dev/null | tr -d '\r')"
  [[ -n "$pid" ]] || fail 'application process is not alive'
  printf 'application pid: %s\n' "$pid"
}

wait_for_page_count() {
  local stage="$1"
  for _ in $(seq 1 120); do
    adb shell uiautomator dump /sdcard/iroha-window.xml >/dev/null 2>&1 || true
    adb pull /sdcard/iroha-window.xml "$output_dir/window.xml" >/dev/null 2>&1 || true
    if grep -Eq '1 / 500|Page 1 of 500|1 / 500ページ' "$output_dir/window.xml" 2>/dev/null; then
      printf '%s: viewer reports all 500 pages\n' "$stage"
      return 0
    fi
    sleep 2
  done
  fail "$stage: viewer did not report 500 pages within four minutes"
}

[[ -f "$fixture" ]] || fail "fixture not found: $fixture"
fixture_bytes="$(stat -c%s "$fixture")"
(( fixture_bytes >= 300 * 1024 * 1024 )) || fail "fixture is below 300 MiB: $fixture_bytes bytes"

adb wait-for-device
mem_kib="$(adb shell cat /proc/meminfo | awk '/MemTotal/ { print $2; exit }' | tr -d '\r')"
[[ "$mem_kib" =~ ^[0-9]+$ ]] || fail 'could not read emulator memory'
(( mem_kib <= 1700000 )) || fail "emulator is not low-memory: MemTotal=${mem_kib} KiB"
low_ram_property="$(adb shell getprop ro.config.low_ram | tr -d '\r')"
{
  printf 'fixture_bytes=%s\n' "$fixture_bytes"
  printf 'fixture_sha256=%s\n' "$(sha256sum "$fixture" | cut -d' ' -f1)"
  printf 'mem_total_kib=%s\n' "$mem_kib"
  printf 'low_ram_property=%s\n' "${low_ram_property:-unset}"
  adb shell getprop ro.build.version.release
} > "$output_dir/environment.txt"

fixture_dir="$(dirname "$fixture")"
fixture_name="$(basename "$fixture")"
python3 -m http.server "$port" --bind 127.0.0.1 --directory "$fixture_dir" > "$output_dir/http.log" 2>&1 &
server_pid=$!
adb reverse "tcp:$port" "tcp:$port"
adb logcat -c
adb shell am force-stop "$package"
adb shell am start -W -a android.intent.action.VIEW \
  -d "iroha-pdf:///device-evidence?url=http%3A%2F%2F127.0.0.1%3A${port}%2F${fixture_name}" \
  "$package" > "$output_dir/launch.txt"

wait_for_page_count cold-open
assert_alive
adb shell dumpsys meminfo "$package" > "$output_dir/meminfo-open.txt"
adb exec-out screencap -p > "$output_dir/large-pdf-open.png"

adb shell am send-trim-memory "$package" RUNNING_CRITICAL
adb shell input keyevent KEYCODE_HOME
adb shell am send-trim-memory "$package" BACKGROUND
sleep 5
adb shell am start -W "$package/.MainActivity" > "$output_dir/resume.txt"
wait_for_page_count trim-and-resume
assert_alive
adb shell dumpsys meminfo "$package" > "$output_dir/meminfo-resume.txt"

adb shell am force-stop "$package"
adb shell am start -W -a android.intent.action.VIEW \
  -d "iroha-pdf:///viewer/$document_id" "$package" > "$output_dir/cold-reopen.txt"
wait_for_page_count cold-reopen
assert_alive
adb shell dumpsys meminfo "$package" > "$output_dir/meminfo-reopen.txt"
adb logcat -d > "$output_dir/logcat.txt"
if grep -Eq "FATAL EXCEPTION|ANR in $package|Process $package .*died" "$output_dir/logcat.txt"; then
  fail 'crash, process death, or ANR found in logcat'
fi

printf 'PASS: 300 MiB / 500-page PDF survived open, critical trim, background/resume, and cold reopen\n'
