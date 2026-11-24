/**
 * Print layouts: several document pages on one sheet, a saddle-stitch booklet, and
 * a poster split across tiles (#23).
 *
 * Every function produces a new PDF. None touches the source, and none knows about
 * the print dialog: the caller saves or prints the bytes. The booklet order is
 * exposed separately because it is the part that is easy to get wrong and easy to
 * test without rendering anything.
 */
import { PDFDocument, type PDFEmbeddedPage } from 'pdf-lib';

export type ImpositionSheet = 'a4' | 'letter';
export type Orientation = 'portrait' | 'landscape';

export type NUpOptions = {
  perSheet: 2 | 4;
  sheet?: ImpositionSheet;
  /** Defaults to landscape for 2-up and portrait for 4-up. */
  orientation?: Orientation;
  /** Points from each sheet edge. */
  margin?: number;
  /** Points between cells. */
  gutter?: number;
};

export type BookletOptions = {
  sheet?: ImpositionSheet;
  /** Points from each sheet edge. */
  margin?: number;
  /** Points between the two pages on a side. */
  gutter?: number;
};

export type PosterOptions = {
  columns: number;
  rows: number;
};

const SHEETS: Record<ImpositionSheet, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

const DEFAULT_MARGIN = 18;
const DEFAULT_GUTTER = 12;

function sheetSize(size: ImpositionSheet, orientation: Orientation): [number, number] {
  const [width, height] = SHEETS[size];
  return orientation === 'landscape' ? [height, width] : [width, height];
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} has to be a positive whole number`);
  }
}

/** Which source page goes where for a saddle-stitch booklet, in output order. */
export function bookletOrder(pageCount: number): Array<number | null> {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('a booklet needs at least one page');
  }
  const total = Math.ceil(pageCount / 4) * 4;
  const order: number[] = [];
  for (let sheet = 0; sheet < total / 4; sheet += 1) {
    // Front: the outside pair, back: the inside pair. Reading the output in order
    // gives the sequence a duplex printer needs: long edge, then the other side.
    order.push(
      total - 2 * sheet - 1,
      2 * sheet,
      2 * sheet + 1,
      total - 2 * sheet - 2,
    );
  }
  return order.map((index) => (index < pageCount ? index : null));
}

function place(
  page: ReturnType<PDFDocument['addPage']>,
  embedded: PDFEmbeddedPage | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (!embedded) return;
  const box = embedded.scale(1);
  const scale = Math.min(width / box.width, height / box.height);
  const drawnWidth = box.width * scale;
  const drawnHeight = box.height * scale;
  page.drawPage(embedded, {
    x: x + (width - drawnWidth) / 2,
    y: y + (height - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  });
}

export async function imposeNUp(
  source: Uint8Array,
  options: NUpOptions,
): Promise<Uint8Array> {
  const perSheet = options.perSheet;
  if (perSheet !== 2 && perSheet !== 4) throw new Error('perSheet has to be 2 or 4');

  const orientation =
    options.orientation ?? (perSheet === 2 ? 'landscape' : 'portrait');
  const margin = options.margin ?? DEFAULT_MARGIN;
  const gutter = options.gutter ?? DEFAULT_GUTTER;
  const [sheetWidth, sheetHeight] = sheetSize(options.sheet ?? 'a4', orientation);
  const columns = perSheet === 2 && orientation === 'portrait' ? 1 : 2;
  const rows = perSheet === 2 && orientation === 'landscape' ? 1 : 2;

  const input = await PDFDocument.load(source);
  const output = await PDFDocument.create();
  const embedded = await output.embedPages(input.getPages());

  const cellWidth = (sheetWidth - 2 * margin - gutter * (columns - 1)) / columns;
  const cellHeight = (sheetHeight - 2 * margin - gutter * (rows - 1)) / rows;
  const perPage = columns * rows;

  for (let start = 0; start < embedded.length; start += perPage) {
    const page = output.addPage([sheetWidth, sheetHeight]);
    for (let offset = 0; offset < perPage && start + offset < embedded.length; offset += 1) {
      const column = offset % columns;
      const row = Math.floor(offset / columns);
      place(
        page,
        embedded[start + offset],
        margin + column * (cellWidth + gutter),
        margin + (rows - 1 - row) * (cellHeight + gutter),
        cellWidth,
        cellHeight,
      );
    }
  }

  return output.save({ useObjectStreams: true });
}

/**
 * A saddle-stitch booklet: four source pages per sheet, two on each side.
 *
 * The pad to a multiple of four is what makes `bookletOrder` simple; the blank
 * pages are not drawn, so a five-page document produces a readable eight-page
 * booklet rather than one with a missing panel.
 */
export async function imposeBooklet(
  source: Uint8Array,
  options: BookletOptions = {},
): Promise<Uint8Array> {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const gutter = options.gutter ?? DEFAULT_GUTTER;
  const [sheetWidth, sheetHeight] = sheetSize(options.sheet ?? 'a4', 'landscape');

  const input = await PDFDocument.load(source);
  const output = await PDFDocument.create();
  const embedded = await output.embedPages(input.getPages());
  const order = bookletOrder(input.getPageCount());

  const halfWidth = (sheetWidth - 2 * margin - gutter) / 2;
  const cellHeight = sheetHeight - 2 * margin;

  for (let index = 0; index < order.length; index += 4) {
    const front = output.addPage([sheetWidth, sheetHeight]);
    const back = output.addPage([sheetWidth, sheetHeight]);
    for (const [page, left, right] of [
      [front, order[index], order[index + 1]],
      [back, order[index + 2], order[index + 3]],
    ] as const) {
      place(
        page,
        left == null ? undefined : embedded[left],
        margin,
        margin,
        halfWidth,
        cellHeight,
      );
      place(
        page,
        right == null ? undefined : embedded[right],
        margin + halfWidth + gutter,
        margin,
        halfWidth,
        cellHeight,
      );
    }
  }

  return output.save({ useObjectStreams: true });
}

/**
 * Splits each page into a grid of enlarged tiles, row-major from the top-left.
 *
 * Each tile keeps the source page's size, so the printed sheets line up with the
 * original before trimming. Content outside a tile is drawn outside the page box
 * and clipped by the viewer, which is why no explicit clipping path is needed.
 */
export async function imposePoster(
  source: Uint8Array,
  options: PosterOptions,
): Promise<Uint8Array> {
  assertPositiveInteger(options.columns, 'columns');
  assertPositiveInteger(options.rows, 'rows');

  const input = await PDFDocument.load(source);
  const output = await PDFDocument.create();
  const pages = input.getPages();
  const embedded = await output.embedPages(pages);

  for (let pageIndex = 0; pageIndex < embedded.length; pageIndex += 1) {
    const { width, height } = pages[pageIndex]!.getSize();
    for (let row = 0; row < options.rows; row += 1) {
      for (let column = 0; column < options.columns; column += 1) {
        const tile = output.addPage([width, height]);
        tile.drawPage(embedded[pageIndex]!, {
          x: -column * width,
          y: -(options.rows - 1 - row) * height,
          width: width * options.columns,
          height: height * options.rows,
        });
      }
    }
  }

  return output.save({ useObjectStreams: true });
}
