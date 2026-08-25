import { readFile } from 'node:fs/promises';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import type { HighlightAnnotation, PdfAnnotation, TextAnnotation } from '@iroha-pdf/core';

import { flattenForDelivery, type FlattenSource } from './flatten';
import { MAX_MOBILE_FLATTEN_BYTES } from './memory-policy';

const TIMESTAMP = '2026-07-12T00:00:00.000Z';

/** The face the app ships, read from where it ships it. */
function bundledFont(): Promise<Uint8Array> {
  return readFile(new URL('../../assets/fonts/NotoSansJP-Regular.otf', import.meta.url))
    .then((buffer) => new Uint8Array(buffer));
}

async function onePagePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([300, 400]);
  return document.save();
}

const highlight: HighlightAnnotation = {
  id: 'h1', documentId: 'doc', pageIndex: 0, kind: 'highlight',
  color: '#FFE45E', position: { x: 0.1, y: 0.1 }, width: 0.4, height: 0.05,
  opacity: 0.42, createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
};

const text: TextAnnotation = {
  id: 't1', documentId: 'doc', pageIndex: 0, kind: 'text',
  color: '#2B5CFF', position: { x: 0.2, y: 0.3 }, text: 'note', fontSize: 12,
  createdAt: TIMESTAMP, updatedAt: TIMESTAMP,
};

/** A source whose bytes are counted, so a refusal can be told from a read. */
function source(sizeBytes: number | undefined, bytes: Uint8Array): FlattenSource & { reads: number } {
  const handle = {
    sizeBytes,
    reads: 0,
    bytes: async () => {
      handle.reads += 1;
      return bytes;
    },
  };
  return handle;
}

describe('flattening for export and print', () => {
  it('burns annotations into a copy the platform can hand on', async () => {
    const input = await onePagePdf();
    const output = await flattenForDelivery(source(input.byteLength, input), [highlight], () => {
      throw new Error('the font must not be read for a highlight-only export');
    });

    expect(output.byteLength).toBeGreaterThan(0);
    expect(await PDFDocument.load(output)).toBeInstanceOf(PDFDocument);
  });

  it('reads the font only when there is text to draw with it', async () => {
    const input = await onePagePdf();
    const loadFont = vi.fn(async () => new Uint8Array());

    await flattenForDelivery(source(input.byteLength, input), [highlight], loadFont);
    expect(loadFont).not.toHaveBeenCalled();
  });

  /**
   * The ceiling exists to keep a document that cannot be rewritten in a phone's
   * heap from being read into it first. A refusal that happens after the read has
   * already made the allocation it was meant to prevent.
   */
  it('refuses an oversized document before reading a byte of it', async () => {
    const input = await onePagePdf();
    const handle = source(MAX_MOBILE_FLATTEN_BYTES + 1, input);

    await expect(flattenForDelivery(handle, [highlight], async () => new Uint8Array()))
      .rejects.toThrow();
    expect(handle.reads).toBe(0);
  });

  it('still flattens a catalogue row that never recorded a size', async () => {
    const input = await onePagePdf();
    const output = await flattenForDelivery(source(undefined, input), [], async () => new Uint8Array());
    expect(output.byteLength).toBeGreaterThan(0);
  });

  /**
   * The app's primary locale is Japanese, and the bundled face is the only thing
   * that can encode it — the built-in PDF fonts are WinAnsi. This reads the very
   * bytes the app ships rather than a stand-in, because a font that subsets wrong
   * is a font that exports a note nobody can read.
   */
  it('draws Japanese text using the face the app actually bundles', async () => {
    const input = await onePagePdf();
    const japanese: PdfAnnotation = { ...text, text: '四半期報告書' };
    const output = await flattenForDelivery(source(input.byteLength, input), [japanese], bundledFont);

    expect(output.byteLength).toBeGreaterThan(input.byteLength);
  });

  /**
   * If the font cannot be read, the export has to fail. Carrying on would produce
   * a copy that looks finished and is missing the note — the one outcome worse
   * than an error, because nobody would go looking for it.
   */
  it('fails the export when the font cannot be read, rather than dropping the note', async () => {
    const input = await onePagePdf();
    const japanese: PdfAnnotation = { ...text, text: '四半期報告書' };

    await expect(
      flattenForDelivery(source(input.byteLength, input), [japanese], async () => {
        throw new Error('asset unavailable');
      }),
    ).rejects.toThrow('asset unavailable');
  });
});
