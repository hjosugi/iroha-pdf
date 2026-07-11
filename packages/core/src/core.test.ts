import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  extractPdfPages,
  mergePdfs,
  mergeSyncOperations,
  normalizePoint,
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
