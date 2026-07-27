#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
brand_dir="$repo_root/assets/branding"
mobile_dir="$repo_root/apps/mobile/assets/images"
desktop_dir="$repo_root/apps/desktop/src-tauri/icons"
tauri_bin="${TAURI_BIN:-$repo_root/node_modules/.bin/tauri}"

command -v rsvg-convert >/dev/null
test -x "$tauri_bin"

rsvg-convert --width 1024 --height 1024 --output "$mobile_dir/icon.png" "$brand_dir/iroha-icon.svg"
rsvg-convert --width 512 --height 512 --output "$mobile_dir/android-icon-foreground.png" "$brand_dir/iroha-foreground.svg"
rsvg-convert --width 432 --height 432 --output "$mobile_dir/android-icon-monochrome.png" "$brand_dir/iroha-monochrome.svg"
rsvg-convert --width 228 --height 228 --output "$mobile_dir/splash-icon.png" "$brand_dir/iroha-splash.svg"
rsvg-convert --width 64 --height 64 --output "$mobile_dir/favicon.png" "$brand_dir/iroha-icon.svg"

"$tauri_bin" icon "$brand_dir/tauri-icon-manifest.json" --output "$desktop_dir"

echo "Generated mobile and Tauri assets from assets/branding."
