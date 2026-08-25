import { beforeEach, describe, expect, it } from 'vitest';
import type { AnnotationTransferItem } from '@embedpdf/plugin-annotation';

import { clearDraft, loadDraft, saveDraft } from './draft-store';

const PATH = '/tmp/doc.pdf';

/** Only the fields the draft layer touches; the engine owns the rest. */
function item(overrides: Record<string, unknown> = {}): AnnotationTransferItem {
  return {
    annotation: { id: 'a1', pageIndex: 0, type: 5, rect: { origin: { x: 1, y: 2 } } },
    ...overrides,
  } as AnnotationTransferItem;
}

/**
 * Storage with no room left, which is how a browser behaves once the quota is gone:
 * reads keep working and writes throw.
 */
function fullStorage(backing: Storage): Storage {
  return {
    get length() {
      return backing.length;
    },
    clear: () => backing.clear(),
    getItem: (key) => backing.getItem(key),
    key: (index) => backing.key(index),
    removeItem: (key) => backing.removeItem(key),
    setItem: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
  };
}

function withFullStorage(run: () => void): void {
  const real = globalThis.localStorage;
  const warn = console.warn;
  globalThis.localStorage = fullStorage(real);
  // The warning is expected here; the assertions are on what the caller is told.
  console.warn = () => {};
  try {
    run();
  } finally {
    globalThis.localStorage = real;
    console.warn = warn;
  }
}

beforeEach(() => {
  localStorage.clear();
});

describe('draft store', () => {
  it('reports nothing for a path that was never drafted', () => {
    expect(loadDraft(PATH)).toBeNull();
  });

  it('round-trips annotations', () => {
    saveDraft(PATH, [item(), item({ annotation: { id: 'a2', pageIndex: 3, type: 9 } })]);
    const draft = loadDraft(PATH);
    expect(draft?.items).toHaveLength(2);
    expect(draft?.items[0]?.annotation.id).toBe('a1');
    expect(draft?.items[1]?.annotation.pageIndex).toBe(3);
    expect(draft?.savedAt).toBeGreaterThan(0);
  });

  it('keeps drafts for different files apart', () => {
    saveDraft(PATH, [item()]);
    saveDraft('/tmp/other.pdf', [item(), item()]);
    expect(loadDraft(PATH)?.items).toHaveLength(1);
    expect(loadDraft('/tmp/other.pdf')?.items).toHaveLength(2);
  });

  it('preserves binary stamp payloads that JSON would otherwise silently empty', () => {
    const bytes = new Uint8Array([1, 2, 250, 255, 0, 42]);
    saveDraft(PATH, [item({ ctx: { data: bytes.buffer, mimeType: 'image/png' } })]);

    const restored = loadDraft(PATH);
    const ctx = restored?.items[0]?.ctx as { data: ArrayBuffer; mimeType: string } | undefined;
    expect(ctx?.mimeType).toBe('image/png');
    expect(ctx?.data).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(ctx!.data)]).toEqual([1, 2, 250, 255, 0, 42]);
  });

  it('drops items whose bitmap cannot be represented, and says how many', () => {
    saveDraft(PATH, [item(), item({ ctx: { imageData: { width: 2, height: 2 } } })]);
    const draft = loadDraft(PATH);
    expect(draft?.items).toHaveLength(1);
    expect(draft?.droppedItems).toBe(1);
  });

  it('clears a draft', () => {
    saveDraft(PATH, [item()]);
    expect(loadDraft(PATH)).not.toBeNull();
    clearDraft(PATH);
    expect(loadDraft(PATH)).toBeNull();
  });

  it('treats corrupt storage as no draft rather than throwing', () => {
    localStorage.setItem(`iroha-pdf:draft:${PATH}`, '{not json');
    expect(loadDraft(PATH)).toBeNull();
  });

  it('rejects a stored value of the wrong shape', () => {
    localStorage.setItem(`iroha-pdf:draft:${PATH}`, JSON.stringify({ items: 'nope' }));
    expect(loadDraft(PATH)).toBeNull();
  });

  it('overwrites rather than accumulating', () => {
    saveDraft(PATH, [item(), item()]);
    saveDraft(PATH, [item()]);
    expect(loadDraft(PATH)?.items).toHaveLength(1);
  });

  it('confirms a draft that reached storage', () => {
    expect(saveDraft(PATH, [item()])).toBe(true);
  });

  it('reports a refused write instead of pretending the work is drafted', () => {
    withFullStorage(() => {
      expect(saveDraft(PATH, [item()])).toBe(false);
    });
    // Silence here is the data-loss path: nothing was written, so nobody may be told
    // that anything was.
    expect(loadDraft(PATH)).toBeNull();
  });

  it('keeps the last draft that fit when a later one is refused', () => {
    saveDraft(PATH, [item()]);
    withFullStorage(() => {
      expect(saveDraft(PATH, [item(), item()])).toBe(false);
    });
    expect(loadDraft(PATH)?.items).toHaveLength(1);
  });
});
