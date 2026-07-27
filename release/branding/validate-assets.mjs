import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pngDimensions(bytes, label) {
  const signature = '89504e470d0a1a0a';
  assert(bytes.subarray(0, 8).toString('hex') === signature, `${label} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

const expectedPngs = new Map([
  ['apps/mobile/assets/images/icon.png', [1024, 1024]],
  ['apps/mobile/assets/images/android-icon-foreground.png', [512, 512]],
  ['apps/mobile/assets/images/android-icon-monochrome.png', [432, 432]],
  ['apps/mobile/assets/images/splash-icon.png', [228, 228]],
  ['apps/mobile/assets/images/favicon.png', [64, 64]],
  ['apps/desktop/src-tauri/icons/32x32.png', [32, 32]],
  ['apps/desktop/src-tauri/icons/128x128.png', [128, 128]],
  ['apps/desktop/src-tauri/icons/128x128@2x.png', [256, 256]],
  ['release/store/screenshots/desktop/01-local-first-workspace.png', [1440, 900]],
  ['release/store/screenshots/desktop/02-pdf-editing.png', [1440, 900]],
  ['release/store/screenshots/desktop/03-annotation-ready-to-save.png', [1440, 900]],
]);

for (const [relativePath, expected] of expectedPngs) {
  const bytes = await read(relativePath);
  const actual = pngDimensions(bytes, relativePath);
  assert(actual[0] === expected[0] && actual[1] === expected[1], `${relativePath} must be ${expected.join('x')}`);
}

for (const [relativePath, minimumSize] of [
  ['apps/desktop/src-tauri/icons/icon.icns', 10_000],
  ['apps/desktop/src-tauri/icons/icon.ico', 1_000],
]) {
  const bytes = await read(relativePath);
  assert(bytes.length > minimumSize, `${relativePath} is unexpectedly small`);
}

const config = JSON.parse(await read('apps/mobile/app.json'));
assert(config.expo.icon === './assets/images/icon.png', 'Expo icon must use the generated master');
assert(config.expo.ios.icon === './assets/images/icon.png', 'iOS icon must use the generated master');
assert(config.expo.android.adaptiveIcon.backgroundColor === '#2B5CFF', 'adaptive background must use brand blue');
assert(!('backgroundImage' in config.expo.android.adaptiveIcon), 'adaptive background image must not shadow backgroundColor');
assert(config.expo.android.adaptiveIcon.monochromeImage, 'Android monochrome icon is required');

const iconSource = await read('assets/branding/iroha-icon.svg');
const foregroundSource = await read('assets/branding/iroha-foreground.svg');
assert(iconSource.includes(Buffer.from('#2B5CFF')), 'master icon must use brand blue');
assert(foregroundSource.includes(Buffer.from('stroke="#FFFFFF"')), 'foreground must use the white mark');

const manifest = JSON.parse(await read('assets/branding/tauri-icon-manifest.json'));
assert(manifest.default === 'iroha-icon.svg', 'Tauri must use the shared master icon');
assert(manifest.android_fg === 'iroha-foreground.svg', 'Tauri must use the shared adaptive foreground');
assert(manifest.android_monochrome === 'iroha-monochrome.svg', 'Tauri must use the shared monochrome mark');

console.log(`Brand assets are complete and consistent (${expectedPngs.size + 2} checked).`);
