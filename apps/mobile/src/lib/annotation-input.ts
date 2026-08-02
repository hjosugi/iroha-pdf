import { clampNormalized, type Point } from '@iroha-pdf/core';

export type Size = { width: number; height: number };

export type PageFrame = Size & {
  left: number;
  top: number;
};

export type PointerSample = {
  point: Point;
  pressure?: number;
};

/** Fits the actual PDF page inside the viewer using react-native-pdf's BOTH policy. */
export function fitPageFrame(container: Size, page: Size): PageFrame {
  if (container.width <= 0 || container.height <= 0 || page.width <= 0 || page.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(container.width / page.width, container.height / page.height);
  const width = page.width * scale;
  const height = page.height * scale;
  return {
    left: (container.width - width) / 2,
    top: (container.height - height) / 2,
    width,
    height,
  };
}

/** Maps a coordinate relative to the page overlay into the persisted page space. */
export function normalizePagePoint(x: number, y: number, frame: Size): Point {
  if (frame.width <= 0 || frame.height <= 0) {
    throw new Error('The PDF page frame must be measurable before accepting input');
  }
  return {
    x: clampNormalized(x / frame.width),
    y: clampNormalized(y / frame.height),
  };
}

/** Only pens provide meaningful pressure. Touch/mouse input keeps legacy width. */
export function pointerPressure(pointerType: string, pressure: number): number | undefined {
  if (pointerType !== 'pen') return undefined;
  if (!Number.isFinite(pressure) || pressure <= 0) return 0.5;
  return clampNormalized(pressure);
}
