/**
 * Producing the flattened copy that Export and Print both hand to the system.
 *
 * This was inline in the viewer, where two things went wrong with it. The memory
 * ceiling was consulted twice, by two expressions that computed the source size
 * differently — one reached for the file when the catalogue row had no size, the
 * other did not — so the guard that warns and the guard that throws could disagree
 * about the same document. And none of it could be tested: the only way to reach it
 * was through a 700-line screen that mobile has no way to render in a test.
 *
 * The file itself stays behind `FlattenSource` so that what is left here is the part
 * worth checking — that an oversized document is refused before its bytes are read,
 * and that the several-megabyte font is only loaded when there is text to draw with
 * it.
 */
import { flattenAnnotations, type PdfAnnotation } from '@iroha-pdf/core';

import { t } from './i18n';
import { bytesToWholeMiB, canFlattenOnMobile, MAX_MOBILE_FLATTEN_BYTES } from './memory-policy';

/**
 * The document as flattening needs it: the size to judge, and the bytes to read
 * only once that size has been accepted.
 */
export type FlattenSource = {
  sizeBytes: number | undefined;
  bytes: () => Promise<Uint8Array>;
};

/** What a document too large to rewrite in a phone's heap is refused with. */
export function tooLargeToFlattenMessage(): string {
  return t('document.largeExportBody', { limit: bytesToWholeMiB(MAX_MOBILE_FLATTEN_BYTES) });
}

/**
 * Burns `annotations` into a copy of `source`, or refuses the job.
 *
 * The size is checked before the bytes are read, not after: reading a 300 MB
 * document into the heap to discover it is too large to rewrite there is the
 * allocation the ceiling exists to prevent.
 */
export async function flattenForDelivery(
  source: FlattenSource,
  annotations: PdfAnnotation[],
  loadFont: () => Promise<Uint8Array>,
): Promise<Uint8Array> {
  if (!canFlattenOnMobile(source.sizeBytes)) throw new Error(tooLargeToFlattenMessage());

  // Loaded only when there is text to draw: the face is several megabytes, and a
  // highlight- or ink-only export has no glyphs to encode.
  const textFont = annotations.some((item) => item.kind === 'text')
    ? await loadFont()
    : undefined;

  return flattenAnnotations(await source.bytes(), annotations, { textFont });
}
