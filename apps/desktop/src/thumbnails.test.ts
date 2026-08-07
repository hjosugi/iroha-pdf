import { describe, expect, it, vi } from 'vitest';

import { ThumbnailStore } from './thumbnails';

/** A blob of a stated size, which is all the store reads from one. */
function blob(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

type Harness = {
  store: ThumbnailStore;
  rendered: number[];
  revoked: string[];
  settle: () => Promise<void>;
};

function harness(options: { maxBytes?: number; sizeOf?: (page: number) => number } = {}): Harness {
  const rendered: number[] = [];
  const revoked: string[] = [];
  const sizeOf = options.sizeOf ?? (() => 1000);
  const store = new ThumbnailStore(
    async (pageIndex) => {
      rendered.push(pageIndex);
      return blob(sizeOf(pageIndex));
    },
    {
      maxBytes: options.maxBytes ?? 4000,
      // jsdom has no object URLs, and a real one would tell the test nothing about
      // whether it was released.
      createObjectUrl: (value) => `blob:page-${value.size}-${revoked.length}-${rendered.length}`,
      revokeObjectUrl: (url) => revoked.push(url),
    },
  );
  return {
    store,
    rendered,
    revoked,
    // Two turns: the render promise, then the `.then` that publishes it.
    settle: async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('ThumbnailStore', () => {
  it('renders nothing until a page is asked for', async () => {
    const { store, rendered, settle } = harness();
    await settle();
    expect(rendered).toEqual([]);
    expect(store.get(0)).toBeUndefined();
  });

  it('renders a requested page once and hands back its URL', async () => {
    const { store, rendered, settle } = harness();
    store.request(3);
    await settle();

    expect(rendered).toEqual([3]);
    expect(store.get(3)).toMatch(/^blob:/);
  });

  it('coalesces repeated requests for a page still rendering', async () => {
    const { store, rendered, settle } = harness();
    // What a scroll does: the same page enters view several times in one frame.
    store.request(2);
    store.request(2);
    store.request(2);
    await settle();

    expect(rendered, 'one render, not three').toEqual([2]);
  });

  it('does not render a page it already holds', async () => {
    const { store, rendered, settle } = harness();
    store.request(1);
    await settle();
    store.request(1);
    await settle();

    expect(rendered).toEqual([1]);
  });

  /**
   * The point of the whole class: a long document must not accumulate. Four pages at
   * 1000 bytes fit the 4000-byte budget; the fifth has to push the oldest out.
   */
  it('drops the least recently used page when the budget is reached', async () => {
    const { store, revoked, settle } = harness({ maxBytes: 4000 });
    for (const page of [0, 1, 2, 3]) {
      store.request(page);
      await settle();
    }
    expect(store.held).toEqual({ pages: 4, bytes: 4000 });

    store.request(4);
    await settle();

    expect(store.held.pages, 'the budget is a ceiling, not a target').toBe(4);
    expect(store.held.bytes).toBeLessThanOrEqual(4000);
    expect(store.get(0), 'the oldest page is the one dropped').toBeUndefined();
    expect(store.get(4)).toBeDefined();
    expect(revoked, 'the bytes behind the dropped page must be released').toHaveLength(1);
  });

  it('keeps a page that was looked at recently over one that was not', async () => {
    const { store, settle } = harness({ maxBytes: 4000 });
    for (const page of [0, 1, 2, 3]) {
      store.request(page);
      await settle();
    }
    // Reading page 0 makes it the most recent, so page 1 becomes the oldest.
    store.get(0);
    store.request(4);
    await settle();

    expect(store.get(0)).toBeDefined();
    expect(store.get(1)).toBeUndefined();
  });

  it('releases a render that lands after the panel closed', async () => {
    const { store, revoked, settle } = harness();
    store.request(0);
    store.dispose();
    await settle();

    // Nothing published it, so nothing else would ever revoke it.
    expect(store.get(0)).toBeUndefined();
    expect(revoked, 'a late render must not leak its URL').toHaveLength(0);
    expect(store.held).toEqual({ pages: 0, bytes: 0 });
  });

  it('releases everything it holds when disposed', async () => {
    const { store, revoked, settle } = harness();
    for (const page of [0, 1]) {
      store.request(page);
      await settle();
    }
    store.dispose();

    expect(revoked).toHaveLength(2);
    expect(store.held).toEqual({ pages: 0, bytes: 0 });
  });

  it('releases a page too large to keep instead of leaking it', async () => {
    const { store, revoked, settle } = harness({ maxBytes: 1000, sizeOf: () => 5000 });
    store.request(0);
    await settle();

    expect(store.get(0), 'a page over the whole budget is not retained').toBeUndefined();
    expect(revoked, 'but its bytes are still released').toHaveLength(1);
  });

  it('leaves the slot empty when a page will not render, and does not retry forever', async () => {
    const rendered: number[] = [];
    const store = new ThumbnailStore(
      async (pageIndex) => {
        rendered.push(pageIndex);
        throw new Error('this page is broken');
      },
      { createObjectUrl: () => 'blob:x', revokeObjectUrl: () => undefined },
    );

    store.request(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(store.get(0)).toBeUndefined();
    // It may be asked again — the strip has no memory of failure — but one request
    // must not become an unbounded retry loop on its own.
    expect(rendered).toEqual([0]);
  });

  it('tells subscribers when a page is dropped, not only when one arrives', async () => {
    const { store, settle } = harness({ maxBytes: 2000 });
    store.request(0);
    await settle();
    store.request(1);
    await settle();
    const listener = vi.fn();
    store.subscribe(listener);

    // Two pages fit; the third pushes page 0 out. Whoever is showing page 0 holds a
    // URL that has just been revoked, so they have to be told.
    store.request(2);
    await settle();

    expect(store.get(0)).toBeUndefined();
    expect(listener, 'an eviction has to reach the strip, or it shows a broken image').toHaveBeenCalled();
  });

  it('tells subscribers when a page becomes available', async () => {
    const { store, settle } = harness();
    const listener = vi.fn();
    store.subscribe(listener);

    store.request(0);
    await settle();

    expect(listener).toHaveBeenCalled();
  });
});
