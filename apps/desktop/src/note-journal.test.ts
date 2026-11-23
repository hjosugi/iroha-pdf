import { describe, expect, it } from 'vitest';
import type { Note } from '@iroha-pdf/core';

import {
  discardNote,
  readNote,
  reconcileNote,
  restoreNote,
  saveNote,
  type NoteBackend,
} from './note-journal';

const NOTE: Note = {
  id: 'desktop-note:doc-1',
  title: 'Linked note',
  body: 'first draft',
  linkedDocumentId: 'doc-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function memoryBackend(options: { failNotes?: () => boolean; failJournal?: () => boolean } = {}) {
  let notes = '{}';
  let journal = '{}';
  const backend: NoteBackend = {
    readNotes: async () => notes,
    writeNotes: async (contents) => {
      if (options.failNotes?.()) throw new Error('No space left on device');
      notes = contents;
    },
    readJournal: async () => journal,
    writeJournal: async (contents) => {
      if (options.failJournal?.()) throw new Error('No space left on device');
      journal = contents;
    },
  };
  return {
    backend,
    notes: () => JSON.parse(notes) as Record<string, Note>,
    journal: () => JSON.parse(journal) as Record<string, unknown>,
  };
}

describe('the desktop note journal', () => {
  it('stores the note and leaves no pending journal entry', async () => {
    const store = memoryBackend();
    await saveNote(store.backend, NOTE);

    expect(store.notes()['doc-1']?.body).toBe('first draft');
    expect(store.journal()).toEqual({});
    expect((await readNote(store.backend, 'doc-1'))?.body).toBe('first draft');
  });

  it('keeps the attempt recoverable when the durable write fails', async () => {
    const store = memoryBackend({ failNotes: () => true });
    await expect(saveNote(store.backend, NOTE)).rejects.toThrow('No space left');

    // The durable note never took it, but the journal did.
    expect(store.notes()['doc-1']).toBeUndefined();
    expect(store.journal()['doc-1']).toMatchObject({ status: 'pending' });

    const recovery = await reconcileNote(store.backend, 'doc-1');
    expect(recovery?.note.body).toBe('first draft');
    expect(store.journal()['doc-1']).toMatchObject({ status: 'recoverable' });
  });

  it('drops an attempt the durable store already has', async () => {
    // Simulates a crash after the durable write but before the journal was cleared.
    let journal = JSON.stringify({
      'doc-1': {
        noteId: 'doc-1',
        previous: null,
        attempted: JSON.stringify(NOTE),
        at: Date.now(),
        status: 'pending',
      },
    });
    const backend: NoteBackend = {
      readNotes: async () => JSON.stringify({ 'doc-1': NOTE }),
      writeNotes: async () => undefined,
      readJournal: async () => journal,
      writeJournal: async (contents) => {
        journal = contents;
      },
    };

    expect(await reconcileNote(backend, 'doc-1')).toBeNull();
    expect(JSON.parse(journal)).toEqual({});
  });

  it('restore makes the recovered text durable and clears the recovery', async () => {
    let fail = true;
    const store = memoryBackend({ failNotes: () => fail });
    await expect(saveNote(store.backend, NOTE)).rejects.toThrow();
    await reconcileNote(store.backend, 'doc-1');

    fail = false;
    const restored = await restoreNote(store.backend, 'doc-1');
    expect(restored.body).toBe('first draft');
    expect(store.notes()['doc-1']?.body).toBe('first draft');
    expect(store.journal()['doc-1']).toBeUndefined();
    expect(await reconcileNote(store.backend, 'doc-1')).toBeNull();
  });

  it('discard clears the recovery without writing the note', async () => {
    const store = memoryBackend({ failNotes: () => true });
    await expect(saveNote(store.backend, NOTE)).rejects.toThrow();
    await reconcileNote(store.backend, 'doc-1');

    await discardNote(store.backend, 'doc-1');
    expect(store.notes()['doc-1']).toBeUndefined();
    expect(store.journal()['doc-1']).toBeUndefined();
    expect(await reconcileNote(store.backend, 'doc-1')).toBeNull();
  });

  it('does not rewrite a note that has not changed', async () => {
    const store = memoryBackend();
    await saveNote(store.backend, NOTE);

    const before = store.notes();
    await saveNote(store.backend, NOTE);
    expect(store.notes()).toEqual(before);
  });

  it('refuses a note that is not linked to a document', async () => {
    const store = memoryBackend();
    await expect(
      saveNote(store.backend, { ...NOTE, linkedDocumentId: undefined }),
    ).rejects.toThrow('linked to a document');
  });
});
