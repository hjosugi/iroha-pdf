/**
 * What the tab strip remembers (#13): the tabs closed in this session, so one can
 * be reopened, and the page each file was last read at, so reopening a file —
 * in this session or a later one — lands where the reader left off.
 *
 * Kept apart from React so the rules are tested directly: what is remembered,
 * what is forgotten, and how much is kept.
 *
 * Which tabs were open is deliberately *not* restored across a restart. A path
 * becomes readable only when the open dialog grants it, and that grant lasts for
 * the session; reopening last session's files at launch would need the grant to
 * outlive the process, which is a change to what this app may read without
 * being asked, not a feature of the tab strip.
 */
import { readStoredObject, storageKey } from './local-storage';

/** Enough to undo a burst of closing; older closures are not worth a menu. */
export const CLOSED_TAB_LIMIT = 10;

/** Files whose reading position is remembered; the least recently read go first. */
export const LAST_PAGE_LIMIT = 200;

const LAST_PAGES_KEY = storageKey('app', 'last-pages');

/**
 * Paths of tabs closed in this window, most recent last. Only a tab with a path
 * can be reopened — a document opened in the browser build has none — and a path
 * closed twice is remembered once, at its latest position.
 */
export class ClosedTabs {
  private paths: string[] = [];
  private readonly listeners = new Set<() => void>();

  remember(path: string | null): void {
    if (!path) return;
    this.paths = [...this.paths.filter((each) => each !== path), path].slice(-CLOSED_TAB_LIMIT);
    this.emit();
  }

  /** Forgets a path that has been opened again by other means. */
  forget(path: string | null): void {
    if (!path || !this.paths.includes(path)) return;
    this.paths = this.paths.filter((each) => each !== path);
    this.emit();
  }

  /** The most recently closed path, removed from the list. */
  takeLast(): string | null {
    const path = this.paths.at(-1) ?? null;
    if (path) {
      this.paths = this.paths.slice(0, -1);
      this.emit();
    }
    return path;
  }

  /** Puts a path back on top, for a reopen that failed. */
  restore(path: string): void {
    this.remember(path);
  }

  count(): number {
    return this.paths.length;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

type LastPages = { entries: Record<string, { page: number; at: number }> };

function readLastPages(): LastPages['entries'] {
  const stored = readStoredObject<LastPages>(LAST_PAGES_KEY);
  const entries = stored?.entries;
  return entries && typeof entries === 'object' ? entries : {};
}

/** The one-based page `path` was last read at, or null when there is none worth restoring. */
export function lastPageFor(path: string | null): number | null {
  if (!path) return null;
  const page = readLastPages()[path]?.page;
  return typeof page === 'number' && Number.isInteger(page) && page > 1 ? page : null;
}

/**
 * Records the page `path` is being read at. Bounded to the most recently read
 * files, so a long history of documents does not grow the store without end. A
 * refused write only means the position is not remembered, which is not worth
 * interrupting anyone over.
 */
export function recordLastPage(path: string | null, page: number, now = Date.now()): void {
  if (!path || !Number.isInteger(page) || page < 1) return;
  const entries = { ...readLastPages(), [path]: { page, at: now } };
  const kept = Object.entries(entries)
    .sort(([, a], [, b]) => b.at - a.at)
    .slice(0, LAST_PAGE_LIMIT);
  try {
    localStorage.setItem(LAST_PAGES_KEY, JSON.stringify({ entries: Object.fromEntries(kept) }));
  } catch {
    // Storage disabled or full; see above.
  }
}

/** Where a tab moved by `delta` places lands, clamped to the strip. */
export function movedIndex(order: readonly string[], id: string, delta: number): number | null {
  const from = order.indexOf(id);
  if (from < 0) return null;
  const to = Math.max(0, Math.min(order.length - 1, from + delta));
  return to === from ? null : to;
}
