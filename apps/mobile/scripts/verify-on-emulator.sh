#!/usr/bin/env bash
# Installs the debug APK on a running emulator and checks the app actually starts.
#
# Building an APK and having an app that runs are different claims. This one installs,
# launches, and then looks for evidence the JS actually loaded — a dev-client build
# happily shows its launcher screen even when the bundle never arrives, so "the process
# is alive" on its own proves very little.
#
# Requires: a booted emulator or device (adb devices), and the APK from
#   cd apps/mobile/android && ./gradlew assembleDebug
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE="$(dirname "$HERE")"
APK="$MOBILE/android/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="app.irohapdf.mobile"
OUT="${IROHA_EMULATOR_OUT:-/tmp/iroha-emulator}"
METRO_PORT=8081

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

mkdir -p "$OUT"
fail=0
check() {
  if [ "$2" = "1" ]; then printf '  [PASS] %s%s\n' "$1" "${3:+ — $3}"
  else printf '  [FAIL] %s%s\n' "$1" "${3:+ — $3}"; fail=$((fail + 1)); fi
}

[ -f "$APK" ] || { echo "APK not found: $APK"; exit 2; }
echo "APK: $(du -h "$APK" | cut -f1)"

adb wait-for-device
echo "device: $(adb shell getprop ro.product.model | tr -d '\r') / Android $(adb shell getprop ro.build.version.release | tr -d '\r')"

echo
echo "installing"
adb uninstall "$PACKAGE" >/dev/null 2>&1 || true
install_log="$(adb install -r "$APK" 2>&1)" || true
grep -q "Success" <<<"$install_log" && check "the APK installs" 1 || check "the APK installs" 0 "$install_log"

# Metro serves the JS bundle; without the reverse tunnel the emulator cannot reach it.
adb reverse tcp:$METRO_PORT tcp:$METRO_PORT >/dev/null 2>&1 || true

echo
echo "starting Metro"
(cd "$MOBILE" && npx expo start --dev-client --port $METRO_PORT > "$OUT/metro.log" 2>&1 &)
for _ in $(seq 1 60); do
  curl -s -m 2 "http://localhost:$METRO_PORT/status" >/dev/null 2>&1 && break
  sleep 2
done
curl -s -m 3 "http://localhost:$METRO_PORT/status" >/dev/null 2>&1 \
  && check "Metro is serving" 1 || check "Metro is serving" 0 "see $OUT/metro.log"

echo
echo "launching"
adb logcat -c || true
# Deep-linking the bundle URL skips the dev launcher and loads the app directly.
adb shell am start -W -a android.intent.action.VIEW \
  -d "iroha-pdf://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$METRO_PORT" \
  "$PACKAGE" >"$OUT/launch.log" 2>&1 || true
grep -q "Status: ok\|LaunchState" "$OUT/launch.log" && check "the app launches" 1 \
  || check "the app launches" 0 "$(tail -2 "$OUT/launch.log" | tr '\n' ' ')"

# Give the bundle time to build and load; a cold Metro build is slow.
for _ in $(seq 1 90); do
  adb logcat -d 2>/dev/null | grep -qE "Running \"main\"|ReactNativeJS|Downloading|BundleDownload" && break
  sleep 2
done
sleep 15

adb logcat -d > "$OUT/logcat.txt" 2>/dev/null || true
adb shell screencap -p /sdcard/iroha.png >/dev/null 2>&1 || true
adb pull /sdcard/iroha.png "$OUT/screen.png" >/dev/null 2>&1 || true

echo
echo "what happened"
pid="$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r' || true)"
[ -n "$pid" ] && check "the process is alive" 1 "pid $pid" || check "the process is alive" 0

grep -qE "FATAL EXCEPTION|Process $PACKAGE .*died|ANR in $PACKAGE" "$OUT/logcat.txt" \
  && check "no crash in logcat" 0 "$(grep -m1 -A3 'FATAL EXCEPTION' "$OUT/logcat.txt" | tr '\n' ' ')" \
  || check "no crash in logcat" 1

# The real question: did the JavaScript run? A dev-client shell with no bundle still
# shows a window and stays alive, so this is what separates "installed" from "works".
grep -qE "ReactNativeJS|Running \"main\"" "$OUT/logcat.txt" \
  && check "the JS bundle ran" 1 || check "the JS bundle ran" 0 "no ReactNativeJS output"

if [ -f "$OUT/screen.png" ]; then
  size=$(stat -c%s "$OUT/screen.png")
  check "a screenshot was captured" 1 "$OUT/screen.png, $((size / 1024)) KB"
else
  check "a screenshot was captured" 0
fi

echo
[ "$fail" = "0" ] && echo "all checks passed" || echo "$fail check(s) FAILED"
echo "artifacts in $OUT"
exit "$fail"
