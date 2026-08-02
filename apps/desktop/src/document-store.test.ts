import { beforeEach, describe, expect, it } from 'vitest';

import {
  forgetDocument,
  getDocumentFile,
  recordDraftWrite,
  recordEdit,
  recordSave,
  registerOpenedFile,
  subscribe,
  type EditEntry,
} from './document-store';

function edit(overrides: Partial<EditEntry> = {}): EditEntry {
  return { at: 1_000, kind: 'create', annotation: 'highlight', pageIndex: 0, ...overrides };
}

beforeEach(() => {
  localStorage.clear();
});

describe('document store', () => {
  it('reports an empty file for an unknown document', () => {
    const file = getDocumentFile('unknown');
    expect(file.path).toBeNull();
    expect(file.edits).toEqual([]);
    expect(file.pendingEdits).toBe(0);
  });

  it('returns a stable snapshot reference so useSyncExternalStore does not loop', () => {
    expect(getDocumentFile('unknown')).toBe(getDocumentFile('other-unknown'));
  });

  it('counts edits as pending until a save clears them', () => {
    registerOpenedFile('doc1', '/tmp/a.pdf');
    recordEdit('doc1', edit());
    recordEdit('doc1', edit({ kind: 'update' }));
    expect(getDocumentFile('doc1').pendingEdits).toBe(2);

    recordSave('doc1', {
      at: 2_000,
      path: '/tmp/a.pdf',
      byteLength: 128,
      editCount: 2,
      kind: 'save',
    });
    expect(getDocumentFile('doc1').pendingEdits).toBe(0);
    expect(getDocumentFile('doc1').revisions).toHaveLength(1);
    forgetDocument('doc1');
  });

  it('restores a previous session history when the same path is reopened', () => {
    registerOpenedFile('doc2', '/tmp/b.pdf');
    recordEdit('doc2', edit({ annotation: 'ink' }));
    forgetDocument('doc2');

    registerOpenedFile('doc2-again', '/tmp/b.pdf');
    const restored = getDocumentFile('doc2-again');
    expect(restored.edits).toHaveLength(1);
    expect(restored.edits[0]?.annotation).toBe('ink');
    // Reopening is not an unsaved change.
    expect(restored.pendingEdits).toBe(0);
    forgetDocument('doc2-again');
  });

  it('reads a history written before the timeline was translatable', () => {
    // What an older build left in the browser: the English name of the mark,
    // with no identifier to look a translation up by.
    localStorage.setItem(
      'iroha-pdf:history:/tmp/legacy.pdf',
      JSON.stringify({
        edits: [
          { at: 1, kind: 'create', label: 'Pen stroke', pageIndex: 0 },
          { at: 2, kind: 'create', label: 'Sticky note', pageIndex: 1 },
          { at: 3, kind: 'delete', label: 'Something this build never wrote', pageIndex: 2 },
          { at: 'invalid', kind: 'create', label: 'Highlight', pageIndex: 3 },
        ],
        revisions: [],
      }),
    );

    registerOpenedFile('legacy', '/tmp/legacy.pdf');
    const { edits } = getDocumentFile('legacy');
    expect(edits.map((entry) => entry.annotation)).toEqual(['ink', 'stickyNote', 'other']);
    recordEdit('legacy', edit({ at: 4, annotation: 'highlight' }));
    const persisted = JSON.parse(localStorage.getItem('iroha-pdf:history:/tmp/legacy.pdf') ?? '{}');
    expect(persisted.edits).toHaveLength(4);
    expect(persisted.edits[0]).not.toHaveProperty('label');
    forgetDocument('legacy');
  });

  it('keeps histories of different files separate', () => {
    registerOpenedFile('x', '/tmp/x.pdf');
    recordEdit('x', edit({ annotation: 'freetext' }));
    registerOpenedFile('y', '/tmp/y.pdf');
    expect(getDocumentFile('y').edits).toEqual([]);
    forgetDocument('x');
    forgetDocument('y');
  });

  it('does not persist history for documents opened without a path', () => {
    registerOpenedFile('nopath', null);
    recordEdit('nopath', edit());
    expect(getDocumentFile('nopath').edits).toHaveLength(1);
    expect(localStorage.length).toBe(0);
    forgetDocument('nopath');
  });

  it('survives corrupt persisted history', () => {
    localStorage.setItem('iroha-pdf:history:/tmp/bad.pdf', '{not json');
    registerOpenedFile('bad', '/tmp/bad.pdf');
    expect(getDocumentFile('bad').edits).toEqual([]);
    forgetDocument('bad');
  });

  it('caps the stored timeline so a long session cannot grow without bound', () => {
    registerOpenedFile('long', '/tmp/long.pdf');
    for (let index = 0; index < 520; index += 1) {
      recordEdit('long', edit({ at: index, pageIndex: index }));
    }
    const file = getDocumentFile('long');
    expect(file.edits).toHaveLength(500);
    // The oldest entries are the ones dropped.
    expect(file.edits[0]?.at).toBe(20);
    expect(file.pendingEdits).toBe(520);
    forgetDocument('long');
  });

  it('flags autosave that could not write, and unflags it when it works again', () => {
    registerOpenedFile('quota', '/tmp/quota.pdf');
    recordDraftWrite('quota', true);
    expect(getDocumentFile('quota').draftFailedAt).toBeNull();

    recordDraftWrite('quota', false);
    expect(getDocumentFile('quota').draftFailedAt).toBeGreaterThan(0);

    recordDraftWrite('quota', true);
    expect(getDocumentFile('quota').draftFailedAt).toBeNull();
    forgetDocument('quota');
  });

  it('keeps the first failure time and does not re-notify while it lasts', () => {
    registerOpenedFile('quota-repeat', '/tmp/quota-repeat.pdf');
    let calls = 0;
    const unsubscribe = subscribe(() => {
      calls += 1;
    });

    recordDraftWrite('quota-repeat', false);
    const first = getDocumentFile('quota-repeat').draftFailedAt;
    recordDraftWrite('quota-repeat', false);
    recordDraftWrite('quota-repeat', false);
    unsubscribe();

    expect(getDocumentFile('quota-repeat').draftFailedAt).toBe(first);
    // Autosave runs after every edit; only the change of state is worth a render.
    expect(calls).toBe(1);
    forgetDocument('quota-repeat');
  });

  it('drops the autosave warning once the work has reached the file', () => {
    registerOpenedFile('quota-saved', '/tmp/quota-saved.pdf');
    recordDraftWrite('quota-saved', false);
    recordSave('quota-saved', {
      at: 3_000,
      path: '/tmp/quota-saved.pdf',
      byteLength: 64,
      editCount: 1,
      kind: 'save',
    });
    expect(getDocumentFile('quota-saved').draftFailedAt).toBeNull();
    forgetDocument('quota-saved');
  });

  it('does not carry an autosave failure into the next document opened', () => {
    registerOpenedFile('reopened', '/tmp/reopened.pdf');
    recordDraftWrite('reopened', false);
    registerOpenedFile('reopened', '/tmp/reopened.pdf');
    expect(getDocumentFile('reopened').draftFailedAt).toBeNull();
    forgetDocument('reopened');
  });

  it('notifies subscribers on change', () => {
    let calls = 0;
    const unsubscribe = subscribe(() => {
      calls += 1;
    });
    registerOpenedFile('sub', '/tmp/sub.pdf');
    recordEdit('sub', edit());
    unsubscribe();
    recordEdit('sub', edit());
    expect(calls).toBe(2);
    forgetDocument('sub');
  });
});
