import { describe, expect, it } from 'vitest';

import {
  appendNoteLink,
  linkLabel,
  noteTargetHref,
  parseNoteLinks,
  parseNoteTarget,
} from './note-links';

const TARGET = {
  documentKey: '/virtual/documents/report.pdf',
  pageIndex: 2,
  rect: { x: 0.125, y: 0.25, width: 0.5, height: 0.0625 },
} as const;

describe('note links', () => {
  it('round-trips a target through its href', () => {
    const href = noteTargetHref({ ...TARGET, rect: { ...TARGET.rect } });
    expect(parseNoteTarget(href)).toEqual({ ...TARGET, rect: { ...TARGET.rect } });
  });

  it('keeps a path with characters that need escaping', () => {
    const documentKey = '/virtual/documents/四半期 報告 & notes.pdf';
    const href = noteTargetHref({ ...TARGET, documentKey, rect: { ...TARGET.rect } });
    expect(parseNoteTarget(href)?.documentKey).toBe(documentKey);
  });

  it('refuses a malformed or foreign href rather than guessing', () => {
    expect(parseNoteTarget('https://example.com')).toBeNull();
    expect(parseNoteTarget('iroha-pdf://note-target?document=x')).toBeNull();
    expect(parseNoteTarget('iroha-pdf://other?document=x&page=0&rect=0,0,1,1')).toBeNull();
    expect(
      parseNoteTarget('iroha-pdf://note-target?document=x&page=-1&rect=0,0,1,1'),
    ).toBeNull();
    expect(
      parseNoteTarget('iroha-pdf://note-target?document=x&page=1&rect=0,0,1'),
    ).toBeNull();
  });

  it('appends a Markdown link without disturbing the rest of the note', () => {
    expect(appendNoteLink('', 'Page 3', 'iroha-pdf://note-target?x')).toBe(
      '[Page 3](iroha-pdf://note-target?x)',
    );
    expect(appendNoteLink('check clause 4\n\n', 'the clause', 'iroha-pdf://note-target?x')).toBe(
      'check clause 4\n\n[the clause](iroha-pdf://note-target?x)',
    );
  });

  it('strips brackets from a label so the Markdown stays a link', () => {
    expect(appendNoteLink('', 'a [b] c', 'iroha-pdf://note-target?x')).toBe(
      '[a b c](iroha-pdf://note-target?x)',
    );
  });

  it('finds only its own links, with their targets', () => {
    const body = [
      'see [the docs](https://example.com)',
      `[clause 4](${noteTargetHref(TARGET)})`,
      '[broken](iroha-pdf://note-target?document=x)',
    ].join('\n');

    const links = parseNoteLinks(body);
    expect(links).toHaveLength(2);
    expect(links[0]?.target).not.toBeNull();
    expect(links[0]?.label).toBe('clause 4');
    expect(links[1]?.target).toBeNull();
  });

  it('uses the selected text as the label, shortened to one line', () => {
    expect(linkLabel('  the  quick\nbrown fox ', 'Page 1')).toBe('the quick brown fox');
    expect(linkLabel('', 'Page 3')).toBe('Page 3');
    expect(linkLabel('x'.repeat(100), 'Page 1')).toHaveLength(60);
    expect(linkLabel('x'.repeat(100), 'Page 1').endsWith('…')).toBe(true);
  });
});
