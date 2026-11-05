import { describe, expect, it } from 'vitest';

import {
  bytesToWholeMiB,
  canRewriteOnMobile,
  MAX_MOBILE_REWRITE_BYTES,
  totalKnownSizeBytes,
} from './memory-policy';

describe('mobile rewrite memory policy', () => {
  it('allows files through the documented in-memory ceiling', () => {
    expect(canRewriteOnMobile(MAX_MOBILE_REWRITE_BYTES)).toBe(true);
    expect(canRewriteOnMobile(MAX_MOBILE_REWRITE_BYTES + 1)).toBe(false);
  });

  it('does not block old catalogue rows whose size is unknown', () => {
    expect(canRewriteOnMobile(undefined)).toBe(true);
  });

  it('rejects invalid known sizes and formats the limit without decimals', () => {
    expect(canRewriteOnMobile(Number.NaN)).toBe(false);
    expect(canRewriteOnMobile(-1)).toBe(false);
    expect(bytesToWholeMiB(MAX_MOBILE_REWRITE_BYTES)).toBe(64);
  });

  it('sums a merge and leaves the decision open when any size is unknown', () => {
    expect(totalKnownSizeBytes([10, 20, 30])).toBe(60);
    expect(totalKnownSizeBytes([])).toBe(0);
    expect(totalKnownSizeBytes([10, undefined, 30])).toBeUndefined();
  });
});
