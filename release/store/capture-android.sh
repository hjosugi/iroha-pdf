#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:?usage: capture-android.sh OUTPUT_DIR}"
package="app.irohapdf.mobile"
mkdir -p "$output_dir"

command -v adb >/dev/null
if command -v magick >/dev/null; then
  image_convert=(magick)
  image_identify=(magick identify)
else
  command -v convert >/dev/null
  command -v identify >/dev/null
  image_convert=(convert)
  image_identify=(identify)
fi

cleanup() {
  adb shell am broadcast \
    -a com.android.systemui.demo \
    -e command exit >/dev/null 2>&1 || true
  adb shell settings delete global sysui_demo_allowed >/dev/null 2>&1 || true
  adb shell settings delete global policy_control >/dev/null 2>&1 || true
}
trap cleanup EXIT

adb wait-for-device
adb shell wm size 1080x1920
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
# Android's documented demo mode keeps all four captures visually deterministic
# without hiding the system bars that users see around the release app.
demo_broadcast=(adb shell am broadcast -a com.android.systemui.demo)
adb shell settings put global sysui_demo_allowed 1
"${demo_broadcast[@]}" -e command enter >/dev/null
"${demo_broadcast[@]}" -e command clock -e hhmm 0941 >/dev/null
"${demo_broadcast[@]}" -e command battery -e level 100 -e plugged false >/dev/null
"${demo_broadcast[@]}" -e command network -e wifi show -e level 4 >/dev/null
"${demo_broadcast[@]}" -e command network -e mobile show -e datatype none -e level 4 >/dev/null
"${demo_broadcast[@]}" -e command notifications -e visible false >/dev/null

scenarios=(library viewer tools drive)
names=(01-library 02-annotate 03-tools 04-drive)

wait_for_viewer() {
  local probe="${RUNNER_TEMP:-/tmp}/iroha-store-viewer-probe.png"
  local entropy=0
  for _ in $(seq 1 30); do
    sleep 2
    adb exec-out screencap -p > "$probe"
    entropy="$("${image_convert[@]}" "$probe" \
      -crop 880x1300+100+300 +repage \
      -colorspace gray -format '%[entropy]' info:)"
    if awk -v value="$entropy" 'BEGIN { exit !(value >= 0.13) }'; then
      rm -f "$probe"
      printf 'viewer render is ready (entropy %s)\n' "$entropy"
      return 0
    fi
  done
  rm -f "$probe"
  echo "viewer did not render within 60 seconds (last entropy $entropy)" >&2
  return 1
}

for index in "${!scenarios[@]}"; do
  scenario="${scenarios[$index]}"
  name="${names[$index]}"
  raw="$output_dir/.${name}-rgba.png"
  final="$output_dir/${name}.png"

  adb shell am force-stop "$package"
  adb shell am start -W \
    -a android.intent.action.VIEW \
    -d "iroha-pdf:///store-preview?screen=$scenario" \
    "$package" >/dev/null
  if [[ "$scenario" == viewer ]]; then wait_for_viewer; else sleep 5; fi
  adb exec-out screencap -p > "$raw"
  "${image_convert[@]}" "$raw" -alpha off -strip -define png:color-type=2 "$final"
  rm -f "$raw"

  dimensions="$("${image_identify[@]}" -format '%wx%h' "$final")"
  if [[ "$dimensions" != 1080x1920 ]]; then
    echo "unexpected Android screenshot size for $final: $dimensions" >&2
    exit 1
  fi
  printf 'captured %s (%s)\n' "$final" "$dimensions"
done
