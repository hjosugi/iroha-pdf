import { describe, expect, it } from 'vitest';
import {
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  rgb,
} from 'pdf-lib';

import { detectBlankPages } from './blank-pages';

async function buildFixture(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const content = pdf.addPage([200, 200]);
  content.drawText('visible', { x: 20, y: 20, size: 12, font });

  // A page with no content stream at all.
  pdf.addPage([200, 200]);

  // A page whose only operators are graphics-state changes.
  const stateOnly = pdf.addPage([200, 200]);
  stateOnly.pushOperators(
    PDFOperator.of(PDFOperatorNames.PushGraphicsState),
    PDFOperator.of(PDFOperatorNames.PopGraphicsState),
  );

  // A page with no visible content but an interactive annotation.
  const linked = pdf.addPage([200, 200]);
  const link = pdf.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: [0, 0, 20, 20],
  });
  linked.node.addAnnot(pdf.context.register(link));

  // A white rectangle still paints.
  const painted = pdf.addPage([200, 200]);
  painted.drawRectangle({ x: 0, y: 0, width: 200, height: 200, color: rgb(1, 1, 1) });

  return pdf.save({ useObjectStreams: true });
}

describe('blank page detection', () => {
  it('finds pages with no content and state-only content', async () => {
    const candidates = await detectBlankPages(await buildFixture());
    expect(candidates.map((candidate) => candidate.pageIndex)).toEqual([1, 2]);
    expect(candidates[0]?.confidence).toBe(1);
    expect(candidates[1]?.confidence).toBe(0.9);
  });

  it('treats an annotation as content even when the page draws nothing', async () => {
    const candidates = await detectBlankPages(await buildFixture());
    expect(candidates.map((candidate) => candidate.pageIndex)).not.toContain(3);
  });

  it('treats a painted page as content, whatever colour it is', async () => {
    const candidates = await detectBlankPages(await buildFixture());
    expect(candidates.map((candidate) => candidate.pageIndex)).not.toContain(4);
  });

  it('honours a stricter threshold', async () => {
    const candidates = await detectBlankPages(await buildFixture(), { threshold: 1 });
    expect(candidates).toEqual([{ pageIndex: 1, confidence: 1 }]);
  });
});
