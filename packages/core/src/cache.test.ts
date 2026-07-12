import { describe, expect, it, vi } from 'vitest';

import { BoundedLruCache } from './cache';

describe('BoundedLruCache', () => {
  it('evicts the least recently used values to remain inside its byte budget', () => {
    const cache = new BoundedLruCache<Uint8Array>({
      maxBytes: 8,
      sizeOf: (value) => value.byteLength,
    });
    cache.set('page-1', new Uint8Array(4));
    cache.set('page-2', new Uint8Array(4));
    cache.get('page-1');
    cache.set('page-3', new Uint8Array(4));

    expect(cache.keysByRecency()).toEqual(['page-3', 'page-1']);
    expect(cache.has('page-2')).toBe(false);
    expect(cache.usedBytes).toBe(8);
  });

  it('does not retain a render larger than the complete cache budget', () => {
    const cache = new BoundedLruCache<Uint8Array>({
      maxBytes: 4,
      sizeOf: (value) => value.byteLength,
    });

    expect(cache.set('oversized-page', new Uint8Array(5))).toBe(false);
    expect(cache.size).toBe(0);
  });

  it('releases all retained renders on a platform memory warning', () => {
    const onEvict = vi.fn();
    const cache = new BoundedLruCache<Uint8Array>({
      maxBytes: 16,
      sizeOf: (value) => value.byteLength,
      onEvict,
    });
    cache.set('thumbnail', new Uint8Array(4));
    cache.handleMemoryWarning();

    expect(cache.usedBytes).toBe(0);
    expect(onEvict).toHaveBeenCalledWith(
      'thumbnail',
      expect.any(Uint8Array),
      'memory-warning',
    );
  });
});

