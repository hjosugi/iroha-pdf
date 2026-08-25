export type CacheEntrySize<Value> = (value: Value) => number;

/** Why a value left the cache. Callers use it to tell a render that is merely
 * cold apart from one the platform asked them to release. */
export type CacheEvictionReason = 'budget' | 'replace' | 'delete' | 'memory-warning';

export type BoundedCacheOptions<Value> = {
  maxBytes: number;
  sizeOf: CacheEntrySize<Value>;
  onEvict?: (key: string, value: Value, reason: CacheEvictionReason) => void;
};

type CacheEntry<Value> = {
  value: Value;
  bytes: number;
};

/**
 * Byte-budgeted LRU intended for rendered pages and thumbnails. Values larger
 * than the whole budget are deliberately not retained.
 *
 * In service since the desktop page strip: `apps/desktop/src/thumbnails.ts` holds
 * rendered thumbnails here, sized by each blob's own byte count. That consumer is
 * where the eviction callback earns its place — releasing an entry has to revoke the
 * object URL behind it, or the browser keeps bytes this class has already forgotten,
 * and the budget would bound a map of strings while the memory it exists to limit grew
 * without end.
 *
 * Page rendering itself is still not cached here and is not meant to be: the engine
 * draws pages on both platforms — pdfium's own tiling on desktop, native on mobile —
 * so no full-size rendered bytes pass through JavaScript.
 */
export class BoundedLruCache<Value> {
  readonly maxBytes: number;
  private readonly entries = new Map<string, CacheEntry<Value>>();
  private readonly sizeOf: CacheEntrySize<Value>;
  private readonly onEvict?: BoundedCacheOptions<Value>['onEvict'];
  private usedBytesValue = 0;

  constructor(options: BoundedCacheOptions<Value>) {
    if (!Number.isFinite(options.maxBytes) || options.maxBytes <= 0) {
      throw new Error('maxBytes must be a positive finite number');
    }
    this.maxBytes = Math.floor(options.maxBytes);
    this.sizeOf = options.sizeOf;
    this.onEvict = options.onEvict;
  }

  get usedBytes(): number {
    return this.usedBytesValue;
  }

  get size(): number {
    return this.entries.size;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get(key: string): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value): boolean {
    const bytes = Math.ceil(this.sizeOf(value));
    if (!Number.isFinite(bytes) || bytes < 0) {
      throw new Error('Cached value size must be a non-negative finite number');
    }

    const existing = this.entries.get(key);
    if (existing) this.evict(key, existing, 'replace');

    if (bytes > this.maxBytes) return false;
    this.entries.set(key, { value, bytes });
    this.usedBytesValue += bytes;
    this.trimToBudget();
    return true;
  }

  delete(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.evict(key, entry, 'delete');
    return true;
  }

  /**
   * Drops everything, recording why.
   *
   * The reason is the whole point of releasing in bulk: a caller that is shutting
   * a panel and a caller the platform has asked for memory back leave the cache in
   * the same state but mean different things by it, and `onEvict` is where that
   * difference is acted on. This used to be `handleMemoryWarning`, which meant a
   * store tearing itself down had to report a memory warning that had not happened.
   */
  releaseAll(reason: CacheEvictionReason): void {
    for (const [key, entry] of [...this.entries]) {
      this.evict(key, entry, reason);
    }
  }

  /** The platform has asked for memory back. */
  handleMemoryWarning(): void {
    this.releaseAll('memory-warning');
  }

  keysByRecency(): string[] {
    return [...this.entries.keys()].reverse();
  }

  private trimToBudget(): void {
    while (this.usedBytesValue > this.maxBytes) {
      const oldest = this.entries.entries().next().value as [string, CacheEntry<Value>] | undefined;
      if (!oldest) break;
      this.evict(oldest[0], oldest[1], 'budget');
    }
  }

  private evict(key: string, entry: CacheEntry<Value>, reason: CacheEvictionReason): void {
    this.entries.delete(key);
    this.usedBytesValue -= entry.bytes;
    this.onEvict?.(key, entry.value, reason);
  }
}
