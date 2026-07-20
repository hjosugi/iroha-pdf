/**
 * Structural assertions about a saved PDF.
 *
 * Checking "the app said Saved" proves nothing about the bytes, so these read the
 * output back: annotations must actually be in the page's /Annots, and the original
 * tables, images and CJK text must still be there afterwards.
 */
import { execFileSync } from 'node:child_process';

import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFStream } from 'pdf-lib';

export type Annotation = {
  subtype: string;
  /** `/C` as an uppercase hex string, or null when the annotation carries no colour. */
  color: string | null;
  /** `/BS /W`, the border width, for annotations that stroke. */
  strokeWidth: number | null;
};

export type PdfFacts = {
  pageCount: number;
  /** Annotation subtypes per page, e.g. [['Square'], []]. */
  annotationSubtypes: string[][];
  /** Full annotation detail, flattened across pages. */
  annotations: Annotation[];
  /** Count of image XObjects reachable from page resources. */
  imageCount: number;
  /** Names of embedded font descriptors, used to prove the CJK font survived. */
  fontNames: string[];
};

/** PDFName.asString() keeps the leading slash; the reports read better without it. */
function stripSlash(name: PDFName): string {
  return name.asString().replace(/^\//, '');
}

/** `/C` holds RGB as three 0–1 numbers; hex is easier to compare against the UI. */
function readColor(annot: PDFDict): string | null {
  const raw = annot.lookupMaybe(PDFName.of('C'), PDFArray);
  if (!raw || raw.size() < 3) return null;
  const channels: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    const value = raw.lookupMaybe(index, PDFNumber);
    if (!value) return null;
    channels.push(Math.round(value.asNumber() * 255));
  }
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Border width lives in `/BS /W`, falling back to the legacy `/Border` array. */
function readStrokeWidth(annot: PDFDict): number | null {
  const bs = annot.lookupMaybe(PDFName.of('BS'), PDFDict);
  const width = bs?.lookupMaybe(PDFName.of('W'), PDFNumber);
  if (width) return width.asNumber();

  const border = annot.lookupMaybe(PDFName.of('Border'), PDFArray);
  const legacy = border && border.size() >= 3 ? border.lookupMaybe(2, PDFNumber) : null;
  return legacy ? legacy.asNumber() : null;
}

export async function inspectPdf(bytes: Uint8Array | Buffer): Promise<PdfFacts> {
  const pdf = await PDFDocument.load(
    bytes instanceof Buffer ? new Uint8Array(bytes) : bytes,
    { throwOnInvalidObject: false },
  );

  const annotationSubtypes: string[][] = [];
  const annotations: Annotation[] = [];
  let imageCount = 0;
  const fontNames = new Set<string>();

  for (const page of pdf.getPages()) {
    const subtypes: string[] = [];
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    if (annots) {
      for (let index = 0; index < annots.size(); index += 1) {
        const annot = annots.lookupMaybe(index, PDFDict);
        const subtype = annot?.get(PDFName.of('Subtype'));
        if (!(subtype instanceof PDFName)) continue;
        subtypes.push(stripSlash(subtype));
        annotations.push({
          subtype: stripSlash(subtype),
          color: readColor(annot!),
          strokeWidth: readStrokeWidth(annot!),
        });
      }
    }
    annotationSubtypes.push(subtypes);

    const resources = page.node.Resources();

    const xobjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (xobjects) {
      for (const [name] of xobjects.entries()) {
        const stream = xobjects.lookupMaybe(name, PDFStream);
        const subtype = stream?.dict.get(PDFName.of('Subtype'));
        if (subtype instanceof PDFName && stripSlash(subtype) === 'Image') imageCount += 1;
      }
    }

    const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (fonts) {
      for (const [name] of fonts.entries()) {
        const font = fonts.lookupMaybe(name, PDFDict);
        const base = font?.get(PDFName.of('BaseFont'));
        if (base instanceof PDFName) fontNames.add(stripSlash(base));
      }
    }
  }

  return {
    pageCount: pdf.getPageCount(),
    annotationSubtypes,
    annotations,
    imageCount,
    fontNames: [...fontNames].sort(),
  };
}

let pdftotextChecked = false;
let pdftotextAvailable = false;

/** Text extraction via poppler when present. Returns null when the tool is missing. */
export function extractText(path: string): string | null {
  if (!pdftotextChecked) {
    pdftotextChecked = true;
    try {
      execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
      pdftotextAvailable = true;
    } catch {
      pdftotextAvailable = false;
    }
  }
  if (!pdftotextAvailable) return null;

  try {
    return execFileSync('pdftotext', [path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;
  }
}
