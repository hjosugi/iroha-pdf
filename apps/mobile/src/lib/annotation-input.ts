import { clampNormalized, type PdfAnnotation, type Point, type Size } from '@iroha-pdf/core';

/** Re-exported so the overlay keeps reaching for its page geometry in one place. */
export type { Size };

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

/** Only pens provide meaningful pressure. Touch/mouse input keeps legacy width. */
export function pointerPressure(pointerType: string, pressure: number): number | undefined {
  if (pointerType !== 'pen') return undefined;
  if (!Number.isFinite(pressure) || pressure <= 0) return 0.5;
  return clampNormalized(pressure);
}

/** Reports pressure state from persisted ink, not only the current pointer. */
export function hasPressureAwareInk(annotations: readonly PdfAnnotation[]): boolean {
  return annotations.some((annotation) =>
    annotation.kind === 'ink'
      && annotation.pressures !== undefined
      && annotation.pressures.length > 0
      && annotation.pressures.length === annotation.points.length);
}

/** The smallest drag that counts as one. Below this the gesture is read as a tap. */
export const MIN_DRAG = 0.01;

export type HighlightBox = { position: Point; width: number; height: number };

/**
 * The rectangle a highlight drag describes, or null when the drag was really a tap.
 *
 * Written out because the direction of the drag must not reach the stored annotation:
 * dragging right-to-left or bottom-to-top gives an end before the start, and a box
 * built from those directly would carry negative dimensions into the file. The
 * position is the corner nearest the origin either way.
 */
export function highlightFromDrag(start: Point, end: Point): HighlightBox | null {
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < MIN_DRAG && height < MIN_DRAG) return null;
  return {
    position: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) },
    width: Math.max(MIN_DRAG, width),
    height: Math.max(MIN_DRAG, height),
  };
}

/**
 * Extends a run of pressures alongside its stroke.
 *
 * A stroke either has a pressure for every point or none at all, so a run that began
 * empty — touch, or a mouse — stays empty rather than acquiring values partway. Within
 * a run, a sample without pressure repeats the last one instead of dropping out and
 * leaving the two arrays a different length.
 */
export function appendPressure(
  pressures: readonly number[],
  sample: number | undefined,
): readonly number[] {
  if (pressures.length === 0) return pressures;
  return [...pressures, sample ?? pressures.at(-1) ?? 0.5];
}

/**
 * The pressures to store with a stroke: only a run that covers every point of it.
 *
 * A shorter run would be read back against the wrong points, drawing a stroke that
 * thickens in places the pen never pressed.
 */
export function pressuresForStroke(
  points: readonly Point[],
  pressures: readonly number[],
): number[] | undefined {
  return pressures.length === points.length ? [...pressures] : undefined;
}
