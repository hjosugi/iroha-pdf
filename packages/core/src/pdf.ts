import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';

import type { PdfAnnotation } from './types';

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

function hexToRgb(color: string): { red: number; green: number; blue: number } {
  const normalized = color.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { red: 0.17, green: 0.36, blue: 1 };
  }

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16) / 255,
    green: Number.parseInt(normalized.slice(2, 4), 16) / 255,
    blue: Number.parseInt(normalized.slice(4, 6), 16) / 255,
  };
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

export async function reorderPdf(
  source: Uint8Array,
  pageOrder: number[],
): Promise<Uint8Array> {
  const input = await PDFDocument.load(source);
  const pageCount = input.getPageCount();
  if (pageOrder.length === 0) throw new Error('pageOrder cannot be empty');

  for (const pageIndex of pageOrder) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
      throw new Error(`Invalid zero-based page index: ${pageIndex}`);
    }
  }

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
  for (const pageIndex of remove) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= input.getPageCount()) {
      throw new Error(`Invalid zero-based page index: ${pageIndex}`);
    }
  }

  const keep = input.getPageIndices().filter((pageIndex) => !remove.has(pageIndex));
  if (keep.length === 0) throw new Error('A PDF must keep at least one page');
  return reorderPdf(source, keep);
}

export async function rotatePdfPages(
  source: Uint8Array,
  pageIndices: number[],
  clockwiseDegrees: 90 | 180 | 270,
): Promise<Uint8Array> {
  const document = await PDFDocument.load(source);
  for (const pageIndex of pageIndices) {
    const page = document.getPage(pageIndex);
    page.setRotation(degrees((page.getRotation().angle + clockwiseDegrees) % 360));
  }
  return document.save({ useObjectStreams: true });
}

function drawAnnotation(page: PDFPage, annotation: PdfAnnotation, font: PDFFont): void {
  const width = page.getWidth();
  const height = page.getHeight();
  const color = hexToRgb(annotation.color);
  const pdfColor = rgb(color.red, color.green, color.blue);

  if (annotation.kind === 'text') {
    page.drawText(annotation.text, {
      x: annotation.position.x * width,
      y: height - annotation.position.y * height - annotation.fontSize,
      size: annotation.fontSize,
      font,
      color: pdfColor,
      maxWidth: width * 0.8,
    });
    return;
  }

  if (annotation.kind === 'highlight') {
    page.drawRectangle({
      x: annotation.position.x * width,
      y: height - (annotation.position.y + annotation.height) * height,
      width: annotation.width * width,
      height: annotation.height * height,
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
      start: { x: previous.x * width, y: height - previous.y * height },
      end: { x: current.x * width, y: height - current.y * height },
      thickness: annotation.strokeWidth,
      color: pdfColor,
      opacity: 0.95,
    });
  }
}

export async function flattenAnnotations(
  source: Uint8Array,
  annotations: PdfAnnotation[],
): Promise<Uint8Array> {
  const document = await PDFDocument.load(source);
  const font = await document.embedFont(StandardFonts.Helvetica);

  for (const annotation of annotations) {
    if (annotation.pageIndex >= document.getPageCount()) continue;
    drawAnnotation(document.getPage(annotation.pageIndex), annotation, font);
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
