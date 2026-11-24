import { describe, expect, it } from 'vitest';

import { findInPages } from './search';

describe('finding text in pages', () => {
  it('matches case-insensitively and keeps the page number', () => {
    const hits = findInPages(['Quarterly Report', 'nothing here'], 'quarterly');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.pageIndex).toBe(0);
    expect(hits[0]?.snippet).toContain('Quarterly Report');
  });

  it('finds every occurrence on a page', () => {
    const hits = findInPages(['clause 4 and clause 5'], 'clause');
    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.offset)).toEqual([0, 13]);
  });

  it('finds Japanese without spaces', () => {
    const hits = findInPages(['四半期報告書 — 表と画像', '別のページ'], '四半期');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.snippet).toContain('四半期報告書');
  });

  it('collapses whitespace and marks a cut excerpt', () => {
    const text = `${'a'.repeat(60)} the  clause\n4 ${'b'.repeat(60)}`;
    const hits = findInPages([text], 'clause', { context: 10 });
    expect(hits[0]?.snippet.startsWith('…')).toBe(true);
    expect(hits[0]?.snippet.endsWith('…')).toBe(true);
    expect(hits[0]?.snippet).toContain('the clause 4');
    expect(hits[0]?.snippet).not.toContain('\n');
  });

  it('ignores an empty query', () => {
    expect(findInPages(['anything'], '')).toEqual([]);
    expect(findInPages(['anything'], '   ')).toEqual([]);
  });

  it('stops at the limit across pages', () => {
    const hits = findInPages(['x x x x', 'x x'], 'x', { limit: 3 });
    expect(hits).toHaveLength(3);
  });
});
