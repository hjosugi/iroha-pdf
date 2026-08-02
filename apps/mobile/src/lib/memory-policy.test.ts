import { describe, expect, it } from 'vitest';

import {
  bytesToWholeMiB,
  canFlattenOnMobile,
  MAX_MOBILE_FLATTEN_BYTES,
} from './memory-policy';

describe('mobile flatten memory policy', () => {
  it('allows files through the documented in-memory ceiling', () => {
    expect(canFlattenOnMobile(MAX_MOBILE_FLATTEN_BYTES)).toBe(true);
    expect(canFlattenOnMobile(MAX_MOBILE_FLATTEN_BYTES + 1)).toBe(false);
  });

  it('does not block old catalogue rows whose size is unknown', () => {
    expect(canFlattenOnMobile(undefined)).toBe(true);
  });

  it('rejects invalid known sizes and formats the limit without decimals', () => {
    expect(canFlattenOnMobile(Number.NaN)).toBe(false);
    expect(canFlattenOnMobile(-1)).toBe(false);
    expect(bytesToWholeMiB(MAX_MOBILE_FLATTEN_BYTES)).toBe(64);
  });
});
