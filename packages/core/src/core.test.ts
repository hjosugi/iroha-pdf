import { PDFArray, PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  extractPdfPages,
  flattenAnnotations,
  imagesToPdf,
  mergePdfs,
  mergeSyncOperations,
  normalizePoint,
  optimizePdfStructure,
  removePdfPages,
  reorderPdf,
  rotatePdfPages,
} from './index';

describe('coordinate helpers', () => {
  it('normalizes and clamps page coordinates', () => {
    expect(normalizePoint({ x: 50, y: 300 }, 100, 200)).toEqual({ x: 0.5, y: 1 });
  });
});

describe('PDF page operations', () => {
  it('reorders and duplicates pages', async () => {
    const input = await PDFDocument.create();
    input.addPage([100, 100]);
    input.addPage([200, 200]);
    const outputBytes = await reorderPdf(await input.save(), [1, 0, 1]);
    const output = await PDFDocument.load(outputBytes);

    expect(output.getPageCount()).toBe(3);
    expect(output.getPage(0).getWidth()).toBe(200);
    expect(output.getPage(1).getWidth()).toBe(100);
  });

  it('rejects out-of-range page numbers without producing a PDF', async () => {
    const input = await PDFDocument.create();
    input.addPage([100, 100]);
    await expect(reorderPdf(await input.save(), [1])).rejects.toThrow(
      'Invalid zero-based page index: 1',
    );
  });

  it('merges PDFs in source order', async () => {
    const first = await PDFDocument.create();
    first.addPage([100, 100]);
    const second = await PDFDocument.create();
    second.addPage([200, 200]);
    second.addPage([300, 300]);

    const output = await PDFDocument.load(await mergePdfs([
      await first.save(),
      await second.save(),
    ]));

    expect(output.getPageCount()).toBe(3);
    expect(output.getPage(2).getWidth()).toBe(300);
  });

  it('extracts, removes, and rotates selected pages', async () => {
    const input = await PDFDocument.create();
    input.addPage([100, 100]);
    input.addPage([200, 200]);
    input.addPage([300, 300]);
    const source = await input.save();

    const extracted = await PDFDocument.load(await extractPdfPages(source, [2, 0]));
    expect(extracted.getPageCount()).toBe(2);
    expect(extracted.getPage(0).getWidth()).toBe(300);

    const removed = await PDFDocument.load(await removePdfPages(source, [1]));
    expect(removed.getPageCount()).toBe(2);
    expect(removed.getPage(1).getWidth()).toBe(300);

    const rotated = await PDFDocument.load(await rotatePdfPages(source, [0], 90));
    expect(rotated.getPage(0).getRotation().angle).toBe(90);
  });
});

describe('PDF output safety', () => {
  it('flattens text, highlight, and ink without mutating the original bytes', async () => {
    const input = await PDFDocument.create();
    input.addPage([200, 300]);
    const source = await input.save();
    const original = source.slice();
    const timestamp = '2026-07-12T00:00:00.000Z';

    const outputBytes = await flattenAnnotations(source, [
      {
        id: 'text', documentId: 'doc', pageIndex: 0, kind: 'text', color: '#112233',
        position: { x: 0.1, y: 0.2 }, text: 'note', fontSize: 12,
        createdAt: timestamp, updatedAt: timestamp,
      },
      {
        id: 'highlight', documentId: 'doc', pageIndex: 0, kind: 'highlight', color: '#ffee00',
        position: { x: 0.2, y: 0.3 }, width: 0.4, height: 0.05, opacity: 0.4,
        createdAt: timestamp, updatedAt: timestamp,
      },
      {
        id: 'ink', documentId: 'doc', pageIndex: 0, kind: 'ink', color: '#0055ff',
        points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }], strokeWidth: 2,
        createdAt: timestamp, updatedAt: timestamp,
      },
    ]);

    expect(source).toEqual(original);
    expect(outputBytes).not.toEqual(source);
    expect((await PDFDocument.load(outputBytes)).getPageCount()).toBe(1);
  });

  it('preserves link annotations during structural optimization', async () => {
    const input = await PDFDocument.create();
    const page = input.addPage([200, 300]);
    const link = input.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [10, 10, 100, 30],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of('https://example.com') },
    });
    page.node.set(PDFName.of('Annots'), input.context.obj([link]));

    const source = await input.save();
    const original = source.slice();
    const output = await PDFDocument.load(await optimizePdfStructure(source));
    const annotations = output.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray);

    expect(annotations.size()).toBe(1);
    expect(source).toEqual(original);
  });

  it('embeds a transparent PNG on an A4 page', async () => {
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8n5WQAAAABJRU5ErkJggg=='),
      (character) => character.charCodeAt(0),
    );
    const output = await PDFDocument.load(await imagesToPdf([
      { bytes: png, mimeType: 'image/png', width: 1, height: 1 },
    ], { pageSize: 'a4', margin: 24 }));

    expect(output.getPageCount()).toBe(1);
    expect(output.getPage(0).getWidth()).toBeCloseTo(595.28, 2);
  });
});

describe('sync merge', () => {
  it('keeps the highest logical clock for the same operation', () => {
    const oldOperation = {
      id: 'op-1',
      deviceId: 'phone',
      entityId: 'note-1',
      entityType: 'note' as const,
      kind: 'upsert' as const,
      logicalClock: 1,
    };
    const newOperation = { ...oldOperation, deviceId: 'desktop', logicalClock: 2 };

    expect(mergeSyncOperations([oldOperation], [newOperation])).toEqual([newOperation]);
  });
});
