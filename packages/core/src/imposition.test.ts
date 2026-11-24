import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { bookletOrder, imposeBooklet, imposeNUp, imposePoster } from './imposition';

async function source(pageCount: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([300, 400]);
    page.drawText(`page ${index + 1}`, { x: 20, y: 20, size: 12, font });
  }
  return pdf.save({ useObjectStreams: true });
}

async function pageSizes(bytes: Uint8Array): Promise<Array<[number, number]>> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((page) => {
    const { width, height } = page.getSize();
    return [Math.round(width * 100) / 100, Math.round(height * 100) / 100];
  });
}

describe('booklet imposition', () => {
  it('pads to a multiple of four and orders the panels for duplex printing', () => {
    expect(bookletOrder(8)).toEqual([7, 0, 1, 6, 5, 2, 3, 4]);
    // A five-page document pads to eight; the missing pages are null, not zero.
    expect(bookletOrder(5)).toEqual([null, 0, 1, null, null, 2, 3, 4]);
    expect(bookletOrder(1)).toEqual([null, 0, null, null]);
  });

  it('writes two landscape sides per four source pages', async () => {
    const sizes = await pageSizes(await imposeBooklet(await source(8)));
    expect(sizes).toHaveLength(4);
    for (const [width, height] of sizes) {
      expect(width).toBeGreaterThan(height);
      expect(width).toBeCloseTo(841.89, 1);
      expect(height).toBeCloseTo(595.28, 1);
    }
  });

  it('refuses an empty document', async () => {
    expect(() => bookletOrder(0)).toThrow();
  });
});

describe('N-up imposition', () => {
  it('puts two pages on a landscape sheet', async () => {
    const sizes = await pageSizes(await imposeNUp(await source(3), { perSheet: 2 }));
    expect(sizes).toHaveLength(2);
    expect(sizes[0]![0]).toBeGreaterThan(sizes[0]![1]);
  });

  it('puts four pages on a portrait sheet by default', async () => {
    const sizes = await pageSizes(await imposeNUp(await source(3), { perSheet: 4 }));
    expect(sizes).toHaveLength(1);
    expect(sizes[0]![1]).toBeGreaterThan(sizes[0]![0]);
  });

  it('honours an explicit orientation and sheet', async () => {
    const sizes = await pageSizes(
      await imposeNUp(await source(2), {
        perSheet: 2,
        orientation: 'portrait',
        sheet: 'letter',
      }),
    );
    expect(sizes[0]).toEqual([612, 792]);
  });
});

describe('poster imposition', () => {
  it('makes one row-major tile per grid cell for every page', async () => {
    const bytes = await imposePoster(await source(2), { columns: 3, rows: 2 });
    const sizes = await pageSizes(bytes);
    expect(sizes).toHaveLength(12);
    for (const size of sizes) expect(size).toEqual([300, 400]);
  });

  it('refuses a grid with no cells', async () => {
    await expect(imposePoster(await source(1), { columns: 0, rows: 2 })).rejects.toThrow();
  });
});
