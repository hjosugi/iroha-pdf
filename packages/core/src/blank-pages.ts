/**
 * Which pages carry no visible content (#30).
 *
 * The detector is deliberately conservative: it only calls a page blank when it can
 * see that nothing on it paints. A page it cannot decode, a page with annotations,
 * and a page with an image — including a blank scan — are all reported as content.
 * Removing a page the reader wanted is worse than leaving one they did not, so the
 * caller gets a confidence and a preview, never an automatic deletion.
 *
 * What it recognises:
 *
 * - no content streams at all;
 * - a content stream that decodes to whitespace;
 * - a content stream whose operators only move the graphics state (`q`, `Q`, `cm`,
 *   `BT`, `Tf`, …) and never paint text, paths, images or shadings.
 *
 * What it deliberately leaves alone: pages whose only content is an image, so a
 * blank *scan* is not removed. Deskew is a separate problem that needs an
 * image-analysis engine, and is not attempted here.
 */
import {
  decodePDFRawStream,
  PDFArray,
  PDFContentStream,
  PDFDocument,
  PDFRawStream,
  PDFStream,
  type PDFPage,
} from 'pdf-lib';

export type BlankPageCandidate = {
  pageIndex: number;
  /** 1 for a page with no content at all, 0.9 for one that only changes state. */
  confidence: number;
};

export type DetectBlankPagesOptions = {
  /** Candidates below this are not returned. Defaults to 0.9. */
  threshold?: number;
};

/**
 * Painting operators: text showing, path painting, images and shadings.
 *
 * Matched only when the token is delimited like a PDF operator, so a page whose
 * text happens to contain `Tj` is still treated as content rather than blank.
 */
const PAINT_OPERATOR =
  /(?:^|[\s)\]}>])(?:Tj|TJ|'|"|Do|sh|S|s|f|F|f\*|B|B\*|b|b\*|BI)(?=$|[\s([{<%/>])/;

function decodeStream(stream: PDFStream): string | null {
  if (stream instanceof PDFContentStream) return stream.getContentsString();
  if (stream instanceof PDFRawStream) {
    try {
      return new TextDecoder('latin1').decode(decodePDFRawStream(stream).decode());
    } catch {
      // An unsupported filter means "cannot tell", and "cannot tell" is content.
      return null;
    }
  }
  return null;
}

function pageConfidence(document: PDFDocument, page: PDFPage): number {
  // A link or a form widget is invisible, but removing the page would remove it.
  const annotations = page.node.Annots();
  if (annotations && annotations.size() > 0) return 0;

  const contents = page.node.Contents();
  if (!contents) return 1;

  const streams =
    contents instanceof PDFArray
      ? contents
          .asArray()
          .map((entry) => document.context.lookup(entry))
          .filter((entry): entry is PDFStream => entry instanceof PDFStream)
      : [contents];

  if (streams.length === 0) return 1;

  let text = '';
  for (const stream of streams) {
    const decoded = decodeStream(stream);
    if (decoded === null) return 0;
    text += decoded;
    // Stop at the first paint: a scanned page's stream can be large, and the
    // answer cannot change after one visible mark.
    if (PAINT_OPERATOR.test(text)) return 0;
  }

  return text.trim() === '' ? 1 : 0.9;
}

/**
 * The pages at or above `threshold` that carry no visible content.
 *
 * The caller is expected to present these and let the user choose; nothing here
 * writes or removes anything.
 */
export async function detectBlankPages(
  source: Uint8Array,
  options: DetectBlankPagesOptions = {},
): Promise<BlankPageCandidate[]> {
  const threshold = options.threshold ?? 0.9;
  const document = await PDFDocument.load(source, { updateMetadata: false });
  return document
    .getPages()
    .map((page, pageIndex) => ({ pageIndex, confidence: pageConfidence(document, page) }))
    .filter((candidate) => candidate.confidence >= threshold);
}
