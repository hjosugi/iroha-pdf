import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

// The built-in PDF fonts are WinAnsi and cannot encode Japanese, so flattening
// a note written in the app's primary locale needs a face bundled with the app
// — there is no network at flatten time and we would not use one if there were.
// pdf-lib subsets on embed, so the exported PDF carries only the glyphs drawn.
const FONT_MODULE = require('../../assets/fonts/NotoSansJP-Regular.otf');

let cached: Promise<Uint8Array> | undefined;

async function read(): Promise<Uint8Array> {
  const asset = Asset.fromModule(FONT_MODULE);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return new File(uri).bytes();
}

/**
 * Bytes of the font used to flatten text annotations, read once per launch —
 * it is several megabytes and export and print both ask for it.
 */
export function loadAnnotationFont(): Promise<Uint8Array> {
  // A failed read must not be cached, or one transient error disables text
  // export for the rest of the session.
  cached ??= read().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
