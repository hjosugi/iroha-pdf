#!/usr/bin/env bash
set -euo pipefail

udid="${1:?usage: capture-ios.sh UDID OUTPUT_DIR WIDTH HEIGHT}"
output_dir="${2:?usage: capture-ios.sh UDID OUTPUT_DIR WIDTH HEIGHT}"
expected_width="${3:?usage: capture-ios.sh UDID OUTPUT_DIR WIDTH HEIGHT}"
expected_height="${4:?usage: capture-ios.sh UDID OUTPUT_DIR WIDTH HEIGHT}"
bundle_id="app.irohapdf.mobile"
mkdir -p "$output_dir"

command -v xcrun >/dev/null
if command -v magick >/dev/null; then
  image_convert=(magick)
  image_identify=(magick identify)
else
  command -v convert >/dev/null
  command -v identify >/dev/null
  image_convert=(convert)
  image_identify=(identify)
fi

xcrun simctl ui "$udid" appearance light
xcrun simctl status_bar "$udid" override \
  --time 9:41 \
  --batteryState charged \
  --batteryLevel 100 \
  --wifiBars 3 \
  --cellularBars 4 >/dev/null

scenarios=(library viewer tools drive)
names=(01-library 02-annotate 03-tools 04-drive)

for index in "${!scenarios[@]}"; do
  scenario="${scenarios[$index]}"
  name="${names[$index]}"
  raw="$output_dir/.${name}-rgba.png"
  final="$output_dir/${name}.png"
  stdout_log="${RUNNER_TEMP:-/tmp}/iroha-${name}-stdout.log"
  stderr_log="${RUNNER_TEMP:-/tmp}/iroha-${name}-stderr.log"

  : > "$stdout_log"
  : > "$stderr_log"
  launch_output="$(xcrun simctl launch \
    --stdout="$stdout_log" \
    --stderr="$stderr_log" \
    --terminate-running-process \
    "$udid" \
    "$bundle_id" \
    -IrohaStoreScenario "$scenario")"
  launch_pid="${launch_output##*: }"
  [[ "$launch_pid" =~ ^[0-9]+$ ]] || {
    echo "unexpected simctl launch result: $launch_output" >&2
    exit 1
  }
  if [[ "$scenario" == viewer ]]; then sleep 12; else sleep 5; fi
  if ! kill -0 "$launch_pid" 2>/dev/null; then
    echo "Iroha PDF exited before the $scenario screenshot" >&2
    cat "$stdout_log" >&2
    cat "$stderr_log" >&2
    xcrun simctl spawn "$udid" log show \
      --last 2m \
      --style compact \
      --predicate 'process == "IrohaPDF"' >&2 || true
    exit 1
  fi
  xcrun simctl io "$udid" screenshot --type=png "$raw" >/dev/null
  "${image_convert[@]}" "$raw" -alpha off -strip -define png:color-type=2 "$final"
  rm -f "$raw"

  dimensions="$("${image_identify[@]}" -format '%wx%h' "$final")"
  if [[ "$dimensions" != "${expected_width}x${expected_height}" ]]; then
    echo "unexpected iOS screenshot size for $final: $dimensions" >&2
    exit 1
  fi
  printf 'captured %s (%s)\n' "$final" "$dimensions"
done

xcrun simctl status_bar "$udid" clear >/dev/null 2>&1 || true
