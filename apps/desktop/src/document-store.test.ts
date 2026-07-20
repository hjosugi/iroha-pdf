import { beforeEach, describe, expect, it } from 'vitest';

import {
  forgetDocument,
  getDocumentFile,
  recordEdit,
  recordSave,
  registerOpenedFile,
  subscribe,
  type EditEntry,
} from './document-store';

function edit(overrides: Partial<EditEntry> = {}): EditEntry {
  return { at: 1_000, kind: 'create', label: 'Highlight', pageIndex: 0, ...overrides };
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
    recordEdit('doc2', edit({ label: 'Pen stroke' }));
    forgetDocument('doc2');

    registerOpenedFile('doc2-again', '/tmp/b.pdf');
    const restored = getDocumentFile('doc2-again');
    expect(restored.edits).toHaveLength(1);
    expect(restored.edits[0]?.label).toBe('Pen stroke');
    // Reopening is not an unsaved change.
    expect(restored.pendingEdits).toBe(0);
    forgetDocument('doc2-again');
  });

  it('keeps histories of different files separate', () => {
    registerOpenedFile('x', '/tmp/x.pdf');
    recordEdit('x', edit({ label: 'Text' }));
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
