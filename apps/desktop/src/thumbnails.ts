/**
 * Page thumbnails, rendered on demand and held to a byte budget.
 *
 * A 500-page document is the case that decides the design: rendering every page to
 * show a strip of them would take minutes and hold half a gigabyte of bitmaps, so
 * nothing is rendered until something asks for it, and what has been rendered is
 * dropped again once the total passes a budget.
 *
 * Two things make that budget real rather than decorative. The size counted is the
 * blob's own, not an estimate. And eviction revokes the object URL — without that the
 * browser keeps the bytes alive no matter what this class forgets, and the cache would
 * bound a map of strings while the memory it exists to limit grew without end.
 */
import { BoundedLruCache } from '@iroha-pdf/core';

export type ThumbnailRenderer = (pageIndex: number) => Promise<Blob>;

export type ThumbnailStoreOptions = {
  maxBytes?: number;
  /** Seam for tests; the browser's own by default. */
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
};

/**
 * Enough for roughly a screenful of thumbnails several times over, and far less than
 * one full-size page render. The number that matters is not this one but that there is
 * one: without it a long document's strip grows until the tab is killed.
 */
export const THUMBNAIL_BUDGET_BYTES = 8 * 1024 * 1024;

export class ThumbnailStore {
  private readonly cache: BoundedLruCache<{ url: string; bytes: number }>;
  private readonly inFlight = new Map<number, Promise<void>>();
  private readonly listeners = new Set<() => void>();
  private readonly render: ThumbnailRenderer;
  private readonly createObjectUrl: (blob: Blob) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private disposed = false;

  constructor(render: ThumbnailRenderer, options: ThumbnailStoreOptions = {}) {
    const createObjectUrl = options.createObjectUrl ?? ((blob) => URL.createObjectURL(blob));
    const revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
    this.render = render;
    this.createObjectUrl = createObjectUrl;
    this.revokeObjectUrl = revokeObjectUrl;
    this.cache = new BoundedLruCache({
      maxBytes: options.maxBytes ?? THUMBNAIL_BUDGET_BYTES,
      sizeOf: (entry) => entry.bytes,
      onEvict: (_key, entry) => {
        // Whatever the reason — budget, replacement, or the panel closing — the bytes
        // behind the URL are only freed here.
        revokeObjectUrl(entry.url);
        // And whoever is showing it has to stop: the URL it holds now points at
        // nothing, so a strip that is not told goes on displaying a broken image
        // where a page used to be.
        this.emit();
      },
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The rendered thumbnail for a page, or undefined if it is not in hand. */
  get(pageIndex: number): string | undefined {
    return this.cache.get(String(pageIndex))?.url;
  }

  /** How many pages are currently held, and how many bytes they occupy. */
  get held(): { pages: number; bytes: number } {
    return { pages: this.cache.size, bytes: this.cache.usedBytes };
  }

  /**
   * Asks for a page to be rendered if it is not already in hand or on its way.
   *
   * Coalescing matters as much as caching here: a scroll can put the same page on
   * screen several times in a frame, and each of those would otherwise start its own
   * render of the same page.
   */
  request(pageIndex: number): void {
    if (this.disposed) return;
    if (this.cache.has(String(pageIndex)) || this.inFlight.has(pageIndex)) return;

    const task = this.render(pageIndex)
      .then((blob) => {
        // The panel may have closed, or the document changed, while this was rendering.
        // Publishing now would put a URL in a cache nobody will ever revoke.
        if (this.disposed) return;
        const url = this.createObjectUrl(blob);
        if (!this.cache.set(String(pageIndex), { url, bytes: blob.size })) {
          // Larger than the whole budget: the cache declines it, so free it here rather
          // than leaving a URL alive that nothing holds a reference to.
          this.revokeObjectUrl(url);
          return;
        }
        this.emit();
      })
      .catch(() => {
        // A page that will not render is not worth retrying on every scroll; the slot
        // stays empty and the strip shows a placeholder.
      })
      .finally(() => {
        this.inFlight.delete(pageIndex);
      });

    this.inFlight.set(pageIndex, task);
  }

  /** Releases every rendered page. Called when the panel closes or the document changes. */
  dispose(): void {
    this.disposed = true;
    // 'delete', not 'memory-warning': the panel is going away, and nothing has
    // asked for memory back. Reporting otherwise would make a routine teardown
    // indistinguishable from real pressure to anyone reading the reason.
    this.cache.releaseAll('delete');
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
