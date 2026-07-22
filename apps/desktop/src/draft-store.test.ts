import { beforeEach, describe, expect, it } from 'vitest';
import type { AnnotationTransferItem } from '@embedpdf/plugin-annotation';

import { clearDraft, hasDraft, loadDraft, saveDraft } from './draft-store';

const PATH = '/tmp/doc.pdf';

/** Only the fields the draft layer touches; the engine owns the rest. */
function item(overrides: Record<string, unknown> = {}): AnnotationTransferItem {
  return {
    annotation: { id: 'a1', pageIndex: 0, type: 5, rect: { origin: { x: 1, y: 2 } } },
    ...overrides,
  } as AnnotationTransferItem;
}

beforeEach(() => {
  localStorage.clear();
});

describe('draft store', () => {
  it('reports nothing for a path that was never drafted', () => {
    expect(loadDraft(PATH)).toBeNull();
    expect(hasDraft(PATH)).toBe(false);
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
    expect(hasDraft(PATH)).toBe(true);
    clearDraft(PATH);
    expect(hasDraft(PATH)).toBe(false);
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
});
