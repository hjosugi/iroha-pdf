#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
brand_dir="$repo_root/assets/branding"
mobile_dir="$repo_root/apps/mobile/assets/images"
desktop_dir="$repo_root/apps/desktop/src-tauri/icons"
store_dir="$repo_root/release/store/play"
tauri_bin="${TAURI_BIN:-$repo_root/node_modules/.bin/tauri}"

command -v rsvg-convert >/dev/null
test -x "$tauri_bin"
if command -v magick >/dev/null; then
  image_convert=(magick)
else
  command -v convert >/dev/null
  image_convert=(convert)
fi

rsvg-convert --width 1024 --height 1024 --output "$mobile_dir/icon.png" "$brand_dir/iroha-icon.svg"
rsvg-convert --width 512 --height 512 --output "$mobile_dir/android-icon-foreground.png" "$brand_dir/iroha-foreground.svg"
rsvg-convert --width 432 --height 432 --output "$mobile_dir/android-icon-monochrome.png" "$brand_dir/iroha-monochrome.svg"
rsvg-convert --width 228 --height 228 --output "$mobile_dir/splash-icon.png" "$brand_dir/iroha-splash.svg"
rsvg-convert --width 64 --height 64 --output "$mobile_dir/favicon.png" "$brand_dir/iroha-icon.svg"

# Play store listing assets. The feature graphic is mandatory for a listing and
# 1024x500 is the only size accepted; the 512 icon is the listing icon, which is
# uploaded separately from the one inside the app bundle.
mkdir -p "$store_dir"
rsvg-convert --width 1024 --height 500 --output "$store_dir/feature-graphic.png" "$brand_dir/iroha-feature-graphic.svg"
rsvg-convert --width 512 --height 512 --output "$store_dir/icon-512.png" "$brand_dir/iroha-icon.svg"
# Google explicitly requires the listing icon to be a 32-bit PNG with alpha.
# The artwork is fully opaque, so librsvg legitimately optimizes it to 24-bit
# RGB; force the channel back without changing a pixel. The feature graphic has
# the opposite requirement and deliberately remains opaque 24-bit RGB.
store_icon_tmp="$store_dir/.icon-512-rgba.png"
"${image_convert[@]}" "$store_dir/icon-512.png" -alpha on -strip -define png:color-type=6 "$store_icon_tmp"
mv "$store_icon_tmp" "$store_dir/icon-512.png"

"$tauri_bin" icon "$brand_dir/tauri-icon-manifest.json" --output "$desktop_dir"

echo "Generated mobile, Tauri, and Play listing assets from assets/branding."
