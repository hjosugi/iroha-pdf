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
 *
 * The budget is the steady-state bound. `suspend`/`resume` are the other half: a window
 * that goes hidden drops everything it holds, and asks for it back when it is shown.
 * `page-visibility.ts` explains why visibility, and not a memory-pressure event, is the
 * trigger a webview can actually give.
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
  /** Pages a hidden window dropped, so `resume` can ask for them again. */
  private readonly suspended = new Set<string>();
  private hidden = false;
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
        // Whatever the reason — budget, replacement, the window hiding, or the panel
        // closing — the bytes behind the URL are only freed here.
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
    const key = String(pageIndex);
    // A page asked for while hidden is remembered rather than drawn: nothing can see
    // it, and the observer will not ask again when the window comes back — an element
    // that never stopped intersecting produces no second entry.
    if (this.hidden) {
      this.suspended.add(key);
      return;
    }
    if (this.cache.has(key) || this.inFlight.has(pageIndex)) return;

    const task = this.render(pageIndex)
      .then((blob) => {
        // The panel may have closed, or the document changed, while this was rendering.
        // Publishing now would put a URL in a cache nobody will ever revoke.
        if (this.disposed) return;
        // And the window may have gone hidden while this was in flight. Keeping it
        // would defeat the release that already ran; the page is remembered instead so
        // it comes back with the rest.
        if (this.hidden) {
          this.suspended.add(key);
          return;
        }
        const url = this.createObjectUrl(blob);
        if (!this.cache.set(key, { url, bytes: blob.size })) {
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

  /**
   * Frees every bitmap because the window has gone hidden, remembering which pages to
   * ask for again in `resume`.
   *
   * Distinct from `dispose`: the panel is still open, and will be looked at again. The
   * `'hidden'` reason is what lets a reader of the eviction log tell this apart from a
   * teardown, and is why neither is `'memory-warning'`.
   */
  suspend(): void {
    if (this.disposed) return;
    this.hidden = true;
    for (const key of this.cache.keysByRecency()) this.suspended.add(key);
    this.cache.releaseAll('hidden');
  }

  /**
   * The window is visible again: ask for what `suspend` released.
   *
   * Only the released pages are asked for, not the pages now on screen: the strip's own
   * IntersectionObserver keeps watching, and a page that scrolled out while hidden
   * would otherwise be re-rendered to no purpose. `request` is already idempotent, so a
   * page that arrived again on its own is left alone.
   */
  resume(): void {
    if (this.disposed) return;
    // Before anything else: while `hidden` is set, `request` only remembers. Clearing it
    // is what makes the re-requests below actually render.
    this.hidden = false;
    if (this.suspended.size === 0) return;
    const pages = [...this.suspended];
    this.suspended.clear();
    for (const key of pages) this.request(Number(key));
  }

  /** Releases every rendered page. Called when the panel closes or the document changes. */
  dispose(): void {
    this.disposed = true;
    this.suspended.clear();
    // 'delete', not 'memory-warning' or 'hidden': the panel is going away, and nothing
    // has asked for memory back and nothing will be shown again. Reporting otherwise
    // would make a routine teardown indistinguishable from real pressure to anyone
    // reading the reason.
    this.cache.releaseAll('delete');
    this.listeners.clear();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
