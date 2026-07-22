/**
 * Deterministic PDF fixtures, built rather than committed so the repo stays light.
 *
 * Everything here is synthetic. docs/TEST_PLAN.md forbids committing fixtures that
 * contain customer data, and generating them also keeps a 500-page file out of git.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(here, 'fixtures');

const JP_FONT = join(
  here,
  '../../../node_modules/@embedpdf/fonts-jp/fonts/NotoSansJP-Regular.otf',
);

const A4: [number, number] = [595.28, 841.89];

/** Uncompressed-friendly CRC32 for the hand-built PNG below. */
function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);

  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

/**
 * A small RGBA PNG with a transparent quadrant, built by hand so the fixture does
 * not depend on an image encoder. TEST_PLAN.md calls for transparent PNG coverage.
 */
export function makeTransparentPng(size = 64): Uint8Array {
  const raw: number[] = [];
  for (let y = 0; y < size; y += 1) {
    raw.push(0); // PNG filter type: none
    for (let x = 0; x < size; x += 1) {
      const transparent = x < size / 2 && y < size / 2;
      raw.push(
        Math.round((x / size) * 255),
        Math.round((y / size) * 255),
        140,
        transparent ? 0 : 255,
      );
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, size);
  ihdrView.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(new Uint8Array(raw)))),
    pngChunk('IEND', new Uint8Array(0)),
  ];

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.length;
  }
  return png;
}

/**
 * The fixture that matters most: a page whose content is easy to destroy.
 * Vector table rules, an embedded image with transparency, and CJK text in an
 * embedded subset font all have to survive an annotate-and-save round trip.
 */
export async function buildComplexPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  // subset: false costs ~4 MB, but pdf-lib's CFF subsetter emits a font poppler and
  // Ghostscript refuse to rasterise. A fixture other engines cannot draw is useless as
  // a regression detector: the app could corrupt the font and nothing would notice.
  const jpFont = await pdf.embedFont(await readFile(JP_FONT), { subset: false });
  const png = await pdf.embedPng(makeTransparentPng());

  const page = pdf.addPage(A4);
  const { width, height } = page.getSize();

  page.drawText('Quarterly Report', { x: 56, y: height - 72, size: 22, font: helvetica });
  page.drawText('四半期報告書 — 表と画像の混在ページ', {
    x: 56,
    y: height - 100,
    size: 13,
    font: jpFont,
    color: rgb(0.25, 0.28, 0.35),
  });

  // A ruled table. Both the rules and the cell text must survive a save.
  const columns = [56, 176, 296, 416, 539];
  const rows = [height - 140, height - 168, height - 196, height - 224, height - 252];
  const headers = ['区分', 'Q1', 'Q2', 'Q3'];
  const body = [
    ['売上高', '1,240', '1,388', '1,502'],
    ['営業利益', '212', '244', '281'],
    ['純利益', '150', '171', '198'],
  ];

  for (const y of rows) {
    page.drawLine({
      start: { x: columns[0]!, y },
      end: { x: columns.at(-1)!, y },
      thickness: 0.75,
      color: rgb(0.6, 0.63, 0.68),
    });
  }
  for (const x of columns) {
    page.drawLine({
      start: { x, y: rows[0]! },
      end: { x, y: rows.at(-1)! },
      thickness: 0.75,
      color: rgb(0.6, 0.63, 0.68),
    });
  }

  headers.forEach((label, index) => {
    page.drawText(label, {
      x: columns[index]! + 8,
      y: rows[0]! - 19,
      size: 10,
      font: jpFont,
    });
  });
  body.forEach((cells, rowIndex) => {
    cells.forEach((cell, columnIndex) => {
      page.drawText(cell, {
        x: columns[columnIndex]! + 8,
        y: rows[rowIndex + 1]! - 19,
        size: 10,
        font: columnIndex === 0 ? jpFont : helvetica,
      });
    });
  });

  page.drawImage(png, { x: 56, y: height - 440, width: 160, height: 160 });
  page.drawText('Figure 1: gradient with transparent quadrant', {
    x: 232,
    y: height - 370,
    size: 9,
    font: helvetica,
    color: rgb(0.4, 0.43, 0.5),
  });

  // A second page so page-scoped assertions have somewhere to be wrong.
  const second = pdf.addPage(A4);
  second.drawText('Appendix', { x: 56, y: second.getHeight() - 72, size: 18, font: helvetica });
  second.drawText('付録: この行が保存後も残ること', {
    x: 56,
    y: second.getHeight() - 104,
    size: 12,
    font: jpFont,
  });
  second.drawRectangle({
    x: 56,
    y: second.getHeight() - 320,
    width: width - 112,
    height: 180,
    borderColor: rgb(0.2, 0.36, 1),
    borderWidth: 1.5,
    color: rgb(0.94, 0.96, 1),
  });

  return pdf.save({ useObjectStreams: true });
}

/** 500 pages, per docs/TEST_PLAN.md. Used to check first-page-interactive latency. */
export async function buildHeavyPdf(pageCount = 500): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage(A4);
    page.drawText(`Page ${index + 1} of ${pageCount}`, {
      x: 56,
      y: page.getHeight() - 72,
      size: 16,
      font,
    });
    // Enough text per page that the file is not trivially small.
    for (let line = 0; line < 32; line += 1) {
      page.drawText(
        `${String(line).padStart(2, '0')} lorem ipsum dolor sit amet consectetur adipiscing elit sed do`,
        { x: 56, y: page.getHeight() - 110 - line * 16, size: 9, font },
      );
    }
  }

  return pdf.save({ useObjectStreams: true });
}

/**
 * Byte-heavy rather than page-heavy: a scan-like document dominated by image data.
 * heavy.pdf has 500 pages but is under half a megabyte, so on its own it never
 * exercises decode cost or image memory. Distinct images are used so nothing can be
 * shared between pages, then reused across several pages to keep generation sane.
 */
export async function buildImageHeavyPdf(
  pageCount = 48,
  distinctImages = 12,
  resolution = 1100,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const embedded = [];
  for (let index = 0; index < distinctImages; index += 1) {
    embedded.push(await pdf.embedPng(makeNoisyPng(resolution, index)));
  }

  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage(A4);
    const image = embedded[index % embedded.length]!;
    page.drawImage(image, {
      x: 24,
      y: 90,
      width: page.getWidth() - 48,
      height: page.getHeight() - 130,
    });
    page.drawText(`Scan ${index + 1}`, { x: 28, y: 48, size: 11, font });
  }

  return pdf.save({ useObjectStreams: true });
}

/** High-entropy image so deflate cannot collapse it into nothing. */
function makeNoisyPng(size: number, seed: number): Uint8Array {
  const raw = new Uint8Array(size * (size * 3 + 1));
  let state = (seed + 1) * 0x9e3779b9;
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0; // filter type
    offset += 1;
    for (let x = 0; x < size * 3; x += 1) {
      // xorshift keeps the fixture deterministic across machines.
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      raw[offset] = state & 0xff;
      offset += 1;
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw, { level: 1 }))),
    pngChunk('IEND', new Uint8Array(0)),
  ];

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const png = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    png.set(chunk, cursor);
    cursor += chunk.length;
  }
  return png;
}

/** Rotated and mixed-size pages: annotation placement must not drift. */
export async function buildRotatedMixedPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const sizes: Array<[number, number]> = [A4, [612, 792], [841.89, 595.28]];
  const rotations = [0, 90, 180, 270];

  sizes.forEach((size, sizeIndex) => {
    rotations.forEach((angle) => {
      const page = pdf.addPage(size);
      page.setRotation(degrees(angle));
      page.drawText(`size ${sizeIndex} rotation ${angle}`, {
        x: 40,
        y: page.getHeight() - 60,
        size: 14,
        font,
      });
    });
  });

  return pdf.save({ useObjectStreams: true });
}

/**
 * A file that claims to be a PDF but is not. Opening it must surface an error rather
 * than hang or take the app down: a viewer that freezes on a bad download is worse
 * than one that says no.
 */
export async function buildCorruptPdf(): Promise<Uint8Array> {
  const valid = await buildRotatedMixedPdf();
  // Keep the header so it is dispatched as a PDF, then destroy the body and xref.
  const damaged = valid.slice(0, Math.floor(valid.length * 0.6));
  damaged.fill(0x00, Math.floor(damaged.length * 0.5));
  return damaged;
}

export const FIXTURES = {
  'complex.pdf': buildComplexPdf,
  'heavy.pdf': () => buildHeavyPdf(),
  'image-heavy.pdf': () => buildImageHeavyPdf(),
  'rotated-mixed.pdf': buildRotatedMixedPdf,
  'corrupt.pdf': buildCorruptPdf,
} as const;

export type FixtureName = keyof typeof FIXTURES;

export function fixturePath(name: FixtureName): string {
  return join(FIXTURE_DIR, name);
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Builds any fixture that is not already on disk. Safe to call concurrently-ish. */
export async function ensureFixtures(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });
  for (const [name, build] of Object.entries(FIXTURES)) {
    const target = join(FIXTURE_DIR, name);
    if (existsSync(target)) continue;
    await writeFile(target, await build());
  }
}
