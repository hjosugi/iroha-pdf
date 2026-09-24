import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLOSED_TAB_LIMIT,
  ClosedTabs,
  LAST_PAGE_LIMIT,
  lastPageFor,
  movedIndex,
  recordLastPage,
} from './tab-session';

/** A localStorage the tests control, including one that refuses writes. */
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  installStorage();
});

describe('closed tabs', () => {
  it('reopens the most recently closed first', () => {
    const closed = new ClosedTabs();
    closed.remember('/a.pdf');
    closed.remember('/b.pdf');

    expect(closed.takeLast()).toBe('/b.pdf');
    expect(closed.takeLast()).toBe('/a.pdf');
    expect(closed.takeLast()).toBeNull();
  });

  it('cannot reopen a tab that had no file behind it', () => {
    const closed = new ClosedTabs();
    closed.remember(null);
    expect(closed.count()).toBe(0);
  });

  it('remembers a path once, at the time it was last closed', () => {
    const closed = new ClosedTabs();
    closed.remember('/a.pdf');
    closed.remember('/b.pdf');
    closed.remember('/a.pdf');

    expect(closed.count()).toBe(2);
    expect(closed.takeLast()).toBe('/a.pdf');
  });

  it('forgets a path that was opened again another way', () => {
    const closed = new ClosedTabs();
    closed.remember('/a.pdf');
    closed.forget('/a.pdf');
    expect(closed.takeLast()).toBeNull();
  });

  it('keeps only the most recent closures', () => {
    const closed = new ClosedTabs();
    for (let index = 0; index < CLOSED_TAB_LIMIT + 5; index++) closed.remember(`/${index}.pdf`);
    expect(closed.count()).toBe(CLOSED_TAB_LIMIT);
    expect(closed.takeLast()).toBe(`/${CLOSED_TAB_LIMIT + 4}.pdf`);
  });

  it('tells subscribers when the list changes, and not otherwise', () => {
    const closed = new ClosedTabs();
    const listener = vi.fn();
    const unsubscribe = closed.subscribe(listener);
    closed.remember('/a.pdf');
    closed.remember(null);
    closed.forget('/missing.pdf');
    closed.takeLast();
    closed.takeLast();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    closed.remember('/b.pdf');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('last page read', () => {
  it('is remembered per file, and survives a new window', () => {
    recordLastPage('/a.pdf', 7);
    recordLastPage('/b.pdf', 3);
    recordLastPage('/a.pdf', 9);

    expect(lastPageFor('/a.pdf')).toBe(9);
    expect(lastPageFor('/b.pdf')).toBe(3);
    expect(lastPageFor('/never.pdf')).toBeNull();
  });

  it('has nothing to restore on the first page, or without a path', () => {
    recordLastPage('/a.pdf', 1);
    expect(lastPageFor('/a.pdf')).toBeNull();
    recordLastPage(null, 5);
    expect(lastPageFor(null)).toBeNull();
  });

  it('ignores a page that is not one', () => {
    recordLastPage('/a.pdf', 4);
    recordLastPage('/a.pdf', 0);
    recordLastPage('/a.pdf', 2.5);
    recordLastPage('/a.pdf', Number.NaN);
    expect(lastPageFor('/a.pdf')).toBe(4);
  });

  it('keeps the most recently read files and drops the oldest', () => {
    for (let index = 0; index < LAST_PAGE_LIMIT + 3; index++) recordLastPage(`/${index}.pdf`, 5, 1000 + index);
    expect(lastPageFor('/0.pdf')).toBeNull();
    expect(lastPageFor('/2.pdf')).toBeNull();
    expect(lastPageFor('/3.pdf')).toBe(5);
    expect(lastPageFor(`/${LAST_PAGE_LIMIT + 2}.pdf`)).toBe(5);
  });

  it('treats unreadable or refused storage as nothing remembered', () => {
    const store = installStorage();
    store.set('iroha-pdf:app:last-pages', '{not json');
    expect(lastPageFor('/a.pdf')).toBeNull();

    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(() => recordLastPage('/a.pdf', 5)).not.toThrow();
  });
});

describe('moving a tab', () => {
  const order = ['a', 'b', 'c'];

  it('moves one place either way', () => {
    expect(movedIndex(order, 'b', 1)).toBe(2);
    expect(movedIndex(order, 'b', -1)).toBe(0);
  });

  it('does nothing past either end, or for a tab that is not there', () => {
    expect(movedIndex(order, 'a', -1)).toBeNull();
    expect(movedIndex(order, 'c', 1)).toBeNull();
    expect(movedIndex(order, 'x', 1)).toBeNull();
  });
});
