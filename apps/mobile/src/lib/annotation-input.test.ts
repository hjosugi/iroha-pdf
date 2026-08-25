import { describe, expect, it } from 'vitest';

import type { PdfAnnotation } from '@iroha-pdf/core';

import {
  appendPressure,
  fitPageFrame,
  hasPressureAwareInk,
  highlightFromDrag,
  pointerPressure,
  pressuresForStroke,
} from './annotation-input';

describe('annotation page coordinates', () => {
  it('fits a portrait page without treating viewer margins as PDF content', () => {
    expect(fitPageFrame({ width: 1000, height: 1000 }, { width: 600, height: 800 })).toEqual({
      left: 125,
      top: 0,
      width: 750,
      height: 1000,
    });
  });

  it('recomputes the frame after a landscape rotation', () => {
    expect(fitPageFrame({ width: 1000, height: 600 }, { width: 600, height: 800 })).toEqual({
      left: 275,
      top: 0,
      width: 450,
      height: 600,
    });
  });
});

describe('stylus pressure', () => {
  it('keeps normalized pen pressure and supplies a hover/down fallback', () => {
    expect(pointerPressure('pen', 0.82)).toBe(0.82);
    expect(pointerPressure('pen', 0)).toBe(0.5);
    expect(pointerPressure('pen', 2)).toBe(1);
  });

  it('does not vary line width for touch or mouse input', () => {
    expect(pointerPressure('touch', 0.9)).toBeUndefined();
    expect(pointerPressure('mouse', 0.5)).toBeUndefined();
  });

  it('restores the pressure indicator only from complete persisted samples', () => {
    const ink = {
      id: 'ink-1',
      documentId: 'document-1',
      pageIndex: 0,
      kind: 'ink',
      color: '#2B5CFF',
      points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
      strokeWidth: 2.4,
      createdAt: '2026-08-02T00:00:00.000Z',
      updatedAt: '2026-08-02T00:00:00.000Z',
    } satisfies PdfAnnotation;

    expect(hasPressureAwareInk([{ ...ink, pressures: [0.2, 0.9] }])).toBe(true);
    expect(hasPressureAwareInk([{ ...ink, pressures: [0.2] }])).toBe(false);
    expect(hasPressureAwareInk([ink])).toBe(false);
  });
});

describe('highlightFromDrag', () => {
  it('reads a drag too small to be deliberate as a tap', () => {
    expect(highlightFromDrag({ x: 0.5, y: 0.5 }, { x: 0.504, y: 0.503 })).toBeNull();
  });

  it('builds a box from a drag down and to the right', () => {
    const box = highlightFromDrag({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.4 });
    expect(box?.position).toEqual({ x: 0.2, y: 0.3 });
    expect(box?.width).toBeCloseTo(0.4, 10);
    expect(box?.height).toBeCloseTo(0.1, 10);
  });

  /**
   * The direction of the drag must not reach the file: a box built straight from an
   * end that precedes its start would carry negative dimensions into the PDF.
   */
  it('gives the same box when the drag runs backwards', () => {
    const forward = highlightFromDrag({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.55 });
    const backward = highlightFromDrag({ x: 0.6, y: 0.55 }, { x: 0.2, y: 0.3 });
    expect(backward).toEqual(forward);
    expect(backward!.width).toBeGreaterThan(0);
    expect(backward!.height).toBeGreaterThan(0);
  });

  it('keeps a long thin drag, and gives its short side a floor', () => {
    // Underlining a line of text is exactly this shape, and it is not a tap.
    const box = highlightFromDrag({ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 });
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(0.8, 10);
    expect(box!.height, 'a zero-height highlight would be invisible').toBeGreaterThan(0);
  });
});

describe('appendPressure', () => {
  it('leaves a run empty when the stroke began without pressure', () => {
    // Touch and mouse give no pressure; a stroke must not acquire it partway.
    expect(appendPressure([], 0.7)).toEqual([]);
  });

  it('extends a run that has pressure', () => {
    expect(appendPressure([0.4, 0.5], 0.6)).toEqual([0.4, 0.5, 0.6]);
  });

  it('repeats the last pressure for a sample that carries none', () => {
    // Dropping the sample instead would leave the run shorter than its stroke.
    expect(appendPressure([0.4, 0.5], undefined)).toEqual([0.4, 0.5, 0.5]);
  });
});

describe('pressuresForStroke', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0.1, y: 0.1 },
    { x: 0.2, y: 0.2 },
  ];

  it('keeps a run that covers every point', () => {
    expect(pressuresForStroke(points, [0.3, 0.4, 0.5])).toEqual([0.3, 0.4, 0.5]);
  });

  it('drops a run that does not, rather than storing a misaligned one', () => {
    expect(pressuresForStroke(points, [0.3, 0.4])).toBeUndefined();
    expect(pressuresForStroke(points, [])).toBeUndefined();
  });
});
