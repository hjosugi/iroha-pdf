import { describe, expect, it } from 'vitest';

import type { PdfAnnotation } from '@iroha-pdf/core';

import {
  fitPageFrame,
  hasPressureAwareInk,
  normalizePagePoint,
  pointerPressure,
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

  it('normalizes and clamps points against the page itself', () => {
    expect(normalizePagePoint(375, 500, { width: 750, height: 1000 })).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizePagePoint(-20, 1100, { width: 750, height: 1000 })).toEqual({ x: 0, y: 1 });
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
