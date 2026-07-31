import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
  degrees,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { extractPdfPages, flattenAnnotations, optimizePdfStructure, reorderPdf } from './pdf';

const FIXED_DATE = new Date('2025-01-01T00:00:00.000Z');

async function createTextFixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setCreationDate(FIXED_DATE);
  document.setModificationDate(FIXED_DATE);
  document.setProducer('Iroha PDF fixture');
  const font = await document.embedFont(StandardFonts.Helvetica);
  document.addPage([595.28, 841.89]).drawText('fixture-one', { font, x: 32, y: 800 });
  document.addPage([612, 792]).drawText('fixture-two', { font, x: 32, y: 750 });
  return document.save({ useObjectStreams: false });
}

function decodedPageContent(document: PDFDocument, pageIndex: number): string {
  const contents = document.getPage(pageIndex).node.Contents();
  if (!contents) return '';
  const objects = contents instanceof PDFArray ? contents.asArray() : [contents];
  return objects.map((object) => {
    const stream = document.context.lookup(object);
    if (!(stream instanceof PDFRawStream)) return '';
    return new TextDecoder().decode(decodePDFRawStream(stream).decode());
  }).join('\n');
}

describe('fixture-based PDF compatibility', () => {
  it('preserves page text content and dimensions through reorder and reopen', async () => {
    const fixture = await createTextFixture();
    const outputBytes = await reorderPdf(fixture, [1, 0]);
    const reopened = await PDFDocument.load(outputBytes);

    expect(reopened.getPageCount()).toBe(2);
    expect(reopened.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(decodedPageContent(reopened, 0)).toContain('<666978747572652D74776F> Tj');
    expect(decodedPageContent(reopened, 1)).toContain('<666978747572652D6F6E65> Tj');
  });

  it('extracts a mixed-size fixture and produces a file that reopens', async () => {
    const outputBytes = await extractPdfPages(await createTextFixture(), [1]);
    const reopened = await PDFDocument.load(outputBytes);

    expect(reopened.getPageCount()).toBe(1);
    expect(reopened.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(decodedPageContent(reopened, 0)).toContain('<666978747572652D74776F> Tj');
  });

  it('keeps fixture content readable after structural optimization', async () => {
    const outputBytes = await optimizePdfStructure(await createTextFixture());
    const reopened = await PDFDocument.load(outputBytes);

    expect(reopened.getPageCount()).toBe(2);
    expect(decodedPageContent(reopened, 0)).toContain('<666978747572652D6F6E65> Tj');
    expect(reopened.getProducer()).toContain('pdf-lib');
  });

  it('rejects corrupt input without producing a partial result', async () => {
    await expect(optimizePdfStructure(new TextEncoder().encode('not a PDF'))).rejects.toThrow();
  });
});

describe('annotations on rotated pages', () => {
  /**
   * A 400x200 page carrying /Rotate is displayed 200x400 for the quarter turns,
   * so the same normalized box lands at a different place in unrotated user
   * space each time. These are the four rectangles the reader should see in the
   * same displayed position; they were derived by hand and confirmed by
   * rasterising the output with poppler, which put the mark in the displayed
   * top-left corner at the same coordinates for all four angles.
   */
  const EXPECTED = new Map([
    [0, '1 0 0 1 20 130 cm'],
    [90, '1 0 0 1 20 10 cm'],
    [180, '1 0 0 1 260 10 cm'],
    [270, '1 0 0 1 260 130 cm'],
  ]);

  it.each([...EXPECTED])('places a highlight for /Rotate %i', async (angle, origin) => {
    const input = await PDFDocument.create();
    input.addPage([400, 200]).setRotation(degrees(angle));

    const outputBytes = await flattenAnnotations(await input.save(), [
      {
        id: 'highlight', documentId: 'doc', pageIndex: 0, kind: 'highlight', color: '#ffee00',
        position: { x: 0.05, y: 0.05 }, width: 0.3, height: 0.3, opacity: 1,
        createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z',
      },
    ]);

    const content = decodedPageContent(await PDFDocument.load(outputBytes), 0);
    // pdf-lib emits the box as a translation followed by a closed path, so the
    // origin and the extent are asserted separately.
    expect(content).toContain(origin);
    expect(content).toContain('0 0 m\n0 60 l\n120 60 l\n120 0 l');
  });

  it('cancels the page rotation so text is not drawn sideways', async () => {
    const input = await PDFDocument.create();
    input.addPage([400, 200]).setRotation(degrees(90));

    const outputBytes = await flattenAnnotations(await input.save(), [
      {
        id: 'text', documentId: 'doc', pageIndex: 0, kind: 'text', color: '#000000',
        position: { x: 0.05, y: 0.05 }, text: 'note', fontSize: 24,
        createdAt: '2026-07-31T00:00:00.000Z', updatedAt: '2026-07-31T00:00:00.000Z',
      },
    ]);

    // A quarter turn in the text matrix, not the identity a page with no
    // /Rotate produces. cos(90°) comes out as a float epsilon rather than 0.
    expect(decodedPageContent(await PDFDocument.load(outputBytes), 0))
      .toMatch(/^[\d.e-]+ 1 -1 [\d.e-]+ [\d.]+ [\d.]+ Tm$/m);
  });
});
