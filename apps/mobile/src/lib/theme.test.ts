import { describe, expect, it } from 'vitest';

import { CONTROL, RADIUS, SPACE, TYPE } from './theme';

describe('native design tokens', () => {
  it('keeps interactive controls at or above the 44-point target', () => {
    expect(CONTROL.minimum).toBeGreaterThanOrEqual(44);
    expect(CONTROL.comfortable).toBeGreaterThanOrEqual(CONTROL.minimum);
  });

  it('keeps spacing, radius, and type scales ordered', () => {
    expect(Object.values(SPACE)).toEqual([...Object.values(SPACE)].sort((a, b) => a - b));
    expect([RADIUS.sm, RADIUS.md, RADIUS.lg, RADIUS.xl]).toEqual(
      [RADIUS.sm, RADIUS.md, RADIUS.lg, RADIUS.xl].sort((a, b) => a - b),
    );
    expect([TYPE.caption, TYPE.label, TYPE.body, TYPE.heading, TYPE.title]).toEqual(
      [TYPE.caption, TYPE.label, TYPE.body, TYPE.heading, TYPE.title].sort((a, b) => a - b),
    );
  });
});
