import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { extractPdfPages, optimizePdfStructure, reorderPdf } from './pdf';

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

