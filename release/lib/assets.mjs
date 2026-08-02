/**
 * The pieces every release-facing validator needs.
 *
 * `assert`, `read` and the repository root were written out identically in both
 * asset validators, and each had its own inline PNG header parse. They are
 * CI gates, so a divergence between two copies of "is this a PNG" is the kind
 * of thing that shows up as one gate passing an asset the other rejects.
 */
import { readFile } from 'node:fs/promises';

/** Repository root, so callers name assets by their path in the repo. */
export const root = new URL('../../', import.meta.url);

export async function read(relativePath) {
  return readFile(new URL(relativePath, root));
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const PNG_SIGNATURE = '89504e470d0a1a0a';

/**
 * Width and height from the IHDR chunk, which the PNG spec fixes at a known
 * offset — enough to check a declared size without decoding the image, and
 * without a dependency to do it.
 */
export function pngDimensions(bytes, label) {
  assert(bytes.subarray(0, 8).toString('hex') === PNG_SIGNATURE, `${label} is not a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
