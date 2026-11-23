/**
 * Finding and removing blank pages on the desktop (#30).
 *
 * Detection and removal are both in `@iroha-pdf/core`; this is the desktop half:
 * it hands the candidates to a preview and writes the result to a new file. The
 * open document is never touched, and nothing is removed until the user has seen
 * the list and confirmed it.
 *
 * Loaded on demand: `pdf-lib` behind it is the same megabyte the page operations
 * and form filling keep out of the entry chunk.
 */
import {
  detectBlankPages,
  removePdfPages,
  type BlankPageCandidate,
} from '@iroha-pdf/core';

import {
  allowSaveSiblings,
  pickSaveLocation,
  writePdfToDisk,
} from './file-bridge';

export type { BlankPageCandidate };

/** Empty when the document has nothing the detector would call blank. */
export function findBlankPages(source: Uint8Array): Promise<BlankPageCandidate[]> {
  return detectBlankPages(source);
}

export type RemoveBlankPagesOutcome =
  | { status: 'written'; path: string }
  | { status: 'cancelled' };

export async function removeBlankPagesAndWrite(
  source: Uint8Array,
  pageIndices: readonly number[],
  sourceName: string,
): Promise<RemoveBlankPagesOutcome> {
  if (pageIndices.length === 0) throw new Error('no pages were selected');
  const bytes = await removePdfPages(source, [...pageIndices]);
  const target = await pickSaveLocation(
    `${sourceName.replace(/\.pdf$/i, '')}-blank-removed.pdf`,
  );
  if (!target) return { status: 'cancelled' };
  await allowSaveSiblings(target);
  await writePdfToDisk(target, bytes.slice().buffer as ArrayBuffer);
  return { status: 'written', path: target };
}
