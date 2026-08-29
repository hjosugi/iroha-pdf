import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';

import type { PdfAnnotation } from './types';
import { pressureStrokeWidth } from './annotations';

export type ImageInput = {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
};

export type ImageToPdfOptions = {
  pageSize?: 'image' | 'a4' | 'letter';
  margin?: number;
};

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
} as const;

/** Used when an annotation carries a colour this code cannot read, so a mark is
 * still drawn somewhere visible rather than silently dropped. */
const FALLBACK_ANNOTATION_COLOR = rgb(0.17, 0.36, 1);

function annotationColor(color: string): RGB {
  const normalized = color.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return FALLBACK_ANNOTATION_COLOR;

  return rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  );
}

function fitInside(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { width: number; height: number } {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale };
}

export async function imagesToPdf(
  images: ImageInput[],
  options: ImageToPdfOptions = {},
): Promise<Uint8Array> {
  if (images.length === 0) throw new Error('At least one image is required');

  const document = await PDFDocument.create();
  const pageSize = options.pageSize ?? 'a4';
  const margin = Math.max(0, options.margin ?? 24);

  for (const image of images) {
    const embedded =
      image.mimeType === 'image/png'
        ? await document.embedPng(image.bytes)
        : await document.embedJpg(image.bytes);

    const dimensions: [number, number] =
      pageSize === 'image'
        ? [image.width, image.height]
        : [...PAGE_SIZES[pageSize]];
    const page = document.addPage(dimensions);
    const fitted = fitInside(
      image.width,
      image.height,
      page.getWidth() - margin * 2,
      page.getHeight() - margin * 2,
    );

    page.drawImage(embedded, {
      x: (page.getWidth() - fitted.width) / 2,
      y: (page.getHeight() - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height,
    });
  }

  return document.save({ useObjectStreams: true });
}

/** Callers pass page numbers straight from user input, so every entry point that
 * accepts them rejects the same way and with the same message. */
function assertPageIndex(pageIndex: number, pageCount: number): void {
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
    throw new Error(`Invalid zero-based page index: ${pageIndex}`);
  }
}

export async function reorderPdf(
  source: Uint8Array,
  pageOrder: number[],
): Promise<Uint8Array> {
  const input = await PDFDocument.load(source);
  const pageCount = input.getPageCount();
  if (pageOrder.length === 0) throw new Error('pageOrder cannot be empty');

  for (const pageIndex of pageOrder) assertPageIndex(pageIndex, pageCount);

  const output = await PDFDocument.create();
  const copiedPages = await output.copyPages(input, pageOrder);
  for (const page of copiedPages) output.addPage(page);

  return output.save({ useObjectStreams: true });
}

export async function mergePdfs(sources: Uint8Array[]): Promise<Uint8Array> {
  if (sources.length < 2) throw new Error('At least two PDFs are required');

  const output = await PDFDocument.create();
  for (const source of sources) {
    const input = await PDFDocument.load(source);
    const copiedPages = await output.copyPages(input, input.getPageIndices());
    for (const page of copiedPages) output.addPage(page);
  }

  return output.save({ useObjectStreams: true });
}

export async function extractPdfPages(
  source: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  return reorderPdf(source, pageIndices);
}

export async function removePdfPages(
  source: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const input = await PDFDocument.load(source);
  const remove = new Set(pageIndices);
  for (const pageIndex of remove) assertPageIndex(pageIndex, input.getPageCount());

  const keep = input.getPageIndices().filter((pageIndex) => !remove.has(pageIndex));
  if (keep.length === 0) throw new Error('A PDF must keep at least one page');
  return reorderPdf(source, keep);
}

/**
 * Splits a document in two, after the page the caller names.
 *
 * Extract and remove can already produce either half, and the mobile Tools screen
 * does exactly that — but "split this at page 10" is a thing a person asks for,
 * and asking for it as two operations over complementary page lists is how you
 * end up with a gap or an overlap. Naming it once means the two halves are the
 * whole document exactly once, by construction.
 */
export async function splitPdfAt(
  source: Uint8Array,
  afterPageIndex: number,
): Promise<[Uint8Array, Uint8Array]> {
  const input = await PDFDocument.load(source);
  const pageCount = input.getPageCount();
  assertPageIndex(afterPageIndex, pageCount);
  if (afterPageIndex === pageCount - 1) {
    throw new Error('Splitting after the last page would leave the second document empty');
  }

  const indices = input.getPageIndices();
  return Promise.all([
    reorderPdf(source, indices.slice(0, afterPageIndex + 1)),
    reorderPdf(source, indices.slice(afterPageIndex + 1)),
  ]) as Promise<[Uint8Array, Uint8Array]>;
}

export async function rotatePdfPages(
  source: Uint8Array,
  pageIndices: number[],
  clockwiseDegrees: 90 | 180 | 270,
): Promise<Uint8Array> {
  const document = await PDFDocument.load(source);
  // Checked here like every sibling, rather than left to pdf-lib. It does reject
  // an out-of-range index, but in its own words — "`index` must be at least 0 and
  // at most 1" — which reached the Tools screen's alert untranslated while Extract
  // and Remove, given the same typed page number, said what this app says.
  for (const pageIndex of pageIndices) assertPageIndex(pageIndex, document.getPageCount());

  // A page named twice was turned twice, so "2,2" came back upside down. Rotating
  // is not reordering: there, naming a page twice is how a page gets duplicated and
  // the repetition is the point. `removePdfPages` collapses its input for the same
  // reason this does.
  for (const pageIndex of new Set(pageIndices)) {
    const page = document.getPage(pageIndex);
    page.setRotation(degrees((page.getRotation().angle + clockwiseDegrees) % 360));
  }
  return document.save({ useObjectStreams: true });
}

/**
 * Annotation coordinates are normalized against the page as the reader sees it,
 * but pdf-lib draws in unrotated user space. On a page carrying /Rotate the two
 * disagree, and a mark placed at the top left of the screen lands at whichever
 * corner the rotation carries it to.
 *
 * `point` maps a normalized position on the displayed page into user space.
 * `width`/`height` are the displayed dimensions, swapped for the quarter turns.
 */
type PageFrame = {
  width: number;
  height: number;
  rotation: number;
  point(nx: number, ny: number): { x: number; y: number };
};

function pageFrame(page: PDFPage): PageFrame {
  const w = page.getWidth();
  const h = page.getHeight();
  // Normalized to 0/90/180/270; a /Rotate outside that is not meaningful and
  // viewers round it, so treat anything unrecognised as upright.
  const rotation = ((Math.round(page.getRotation().angle / 90) * 90) % 360 + 360) % 360;
  const quarterTurn = rotation === 90 || rotation === 270;

  const point = (nx: number, ny: number): { x: number; y: number } => {
    switch (rotation) {
      case 90:
        return { x: ny * w, y: nx * h };
      case 180:
        return { x: w - nx * w, y: ny * h };
      case 270:
        return { x: w - ny * w, y: h - nx * h };
      default:
        return { x: nx * w, y: h - ny * h };
    }
  };

  return { width: quarterTurn ? h : w, height: quarterTurn ? w : h, rotation, point };
}

function drawAnnotation(
  page: PDFPage,
  frame: PageFrame,
  annotation: PdfAnnotation,
  font: PDFFont,
): void {
  const pdfColor = annotationColor(annotation.color);

  if (annotation.kind === 'text') {
    // The stored point is the top left of the text; the baseline sits one font
    // size below it. Applying that offset in displayed space rather than user
    // space keeps it pointing at the reader's "down" on a rotated page.
    const baseline = frame.point(
      annotation.position.x,
      annotation.position.y + annotation.fontSize / frame.height,
    );
    page.drawText(annotation.text, {
      x: baseline.x,
      y: baseline.y,
      size: annotation.fontSize,
      font,
      color: pdfColor,
      maxWidth: frame.width * 0.8,
      // Cancels the page rotation, so the text reads upright on screen.
      rotate: degrees(frame.rotation),
    });
    return;
  }

  if (annotation.kind === 'highlight') {
    // Both corners are mapped and the box rebuilt from them: which corner ends
    // up lowest-leftmost in user space depends on the rotation, and this avoids
    // a width and height formula per quarter turn.
    const a = frame.point(annotation.position.x, annotation.position.y);
    const b = frame.point(
      annotation.position.x + annotation.width,
      annotation.position.y + annotation.height,
    );
    page.drawRectangle({
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
      color: pdfColor,
      opacity: annotation.opacity,
      borderOpacity: 0,
    });
    return;
  }

  for (let index = 1; index < annotation.points.length; index += 1) {
    const previous = annotation.points[index - 1];
    const current = annotation.points[index];
    if (!previous || !current) continue;
    page.drawLine({
      start: frame.point(previous.x, previous.y),
      end: frame.point(current.x, current.y),
      thickness: pressureStrokeWidth(
        annotation.strokeWidth,
        annotation.pressures?.[index] ?? annotation.pressures?.[index - 1],
      ),
      color: pdfColor,
      opacity: 0.95,
    });
  }
}

export type FlattenAnnotationsOptions = {
  /**
   * Font used to draw text annotations. The built-in PDF fonts are WinAnsi and
   * cannot encode Japanese — the app's primary locale — so a caller that lets
   * users type outside Latin-1 has to supply one that covers their script.
   * pdf-lib subsets it, so the output carries only the glyphs actually drawn.
   */
  textFont?: Uint8Array;
};

/**
 * Returns the first character of `text` that `font` cannot encode, or undefined
 * when the whole string is representable. pdf-lib's own encoder is the oracle
 * here rather than a WinAnsi table copied into this repo, which would drift.
 */
function findUnencodableCharacter(font: PDFFont, text: string): string | undefined {
  try {
    font.encodeText(text);
    return undefined;
  } catch {
    return Array.from(text).find((character) => {
      try {
        font.encodeText(character);
        return false;
      } catch {
        return true;
      }
    });
  }
}

async function embedTextFont(
  document: PDFDocument,
  textFont: Uint8Array | undefined,
): Promise<PDFFont> {
  if (!textFont) return document.embedFont(StandardFonts.Helvetica);
  document.registerFontkit(fontkit);
  return document.embedFont(textFont, { subset: true });
}

/**
 * Fails before anything is written, and names the character. pdf-lib would
 * otherwise throw part-way through with a message that says nothing about which
 * annotation is at fault or what the caller should do about it.
 */
function assertAnnotationsEncodable(font: PDFFont, annotations: PdfAnnotation[]): void {
  for (const annotation of annotations) {
    if (annotation.kind !== 'text') continue;
    const character = findUnencodableCharacter(font, annotation.text);
    if (character === undefined) continue;
    const codePoint = character.codePointAt(0) ?? 0;
    throw new Error(
      `Annotation text contains "${character}" (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}), ` +
        'which the font used for flattening cannot encode. ' +
        'Pass options.textFont with a font covering this script.',
    );
  }
}

export async function flattenAnnotations(
  source: Uint8Array,
  annotations: PdfAnnotation[],
  options: FlattenAnnotationsOptions = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.load(source);
  const font = await embedTextFont(document, options.textFont);
  assertAnnotationsEncodable(font, annotations);

  // A page's frame is the same for every mark on it, and reading it costs two
  // MediaBox lookups; a heavily annotated page would otherwise pay them per mark.
  const pageCount = document.getPageCount();
  const frames = new Map<number, PageFrame>();
  for (const annotation of annotations) {
    if (annotation.pageIndex >= pageCount) continue;
    const page = document.getPage(annotation.pageIndex);
    let frame = frames.get(annotation.pageIndex);
    if (!frame) {
      frame = pageFrame(page);
      frames.set(annotation.pageIndex, frame);
    }
    drawAnnotation(page, frame, annotation, font);
  }

  return document.save({
    addDefaultPage: false,
    objectsPerTick: 50,
    useObjectStreams: true,
  });
}

export async function optimizePdfStructure(source: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.load(source, { updateMetadata: false });
  return document.save({
    addDefaultPage: false,
    objectsPerTick: 25,
    useObjectStreams: true,
    updateFieldAppearances: false,
  });
}
