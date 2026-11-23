/**
 * The write-ahead journal behind desktop linked notes.
 *
 * Mobile keeps notes in SQLite and wraps every write in `journaledWrite`, so a
 * process killed between the debounce and the disk leaves a row that is
 * reconciled on the next launch and offered back. Desktop notes used to be a
 * plain `localStorage.setItem` — clearing site data cleared them, and a refused
 * write left nothing to recover (#239).
 *
 * This is the same shape with a different store: two JSON files in the app's
 * private data directory, written through Tauri so they are outside the
 * webview's storage. The logic is kept here, over a tiny backend interface, so
 * it can be tested without a webview or a filesystem.
 *
 * Order of a write:
 *   1. record the previous and attempted snapshots in the journal;
 *   2. replace the durable note;
 *   3. drop the journal entry.
 * A crash after 1 leaves a pending entry; after 2 the durable note already
 * equals the attempt, which `decideJournalRecovery` recognises as applied.
 */
import { decideJournalRecovery, type Note } from '@iroha-pdf/core';

export type NoteBackend = {
  readNotes(): Promise<string>;
  writeNotes(contents: string): Promise<void>;
  readJournal(): Promise<string>;
  writeJournal(contents: string): Promise<void>;
};

export type NoteRecovery = {
  /** The document the recovered note belongs to. */
  noteId: string;
  note: Note;
  at: number;
};

type NotesFile = Record<string, Note>;

type JournalEntry = {
  noteId: string;
  /** The durable note before the attempt, as JSON, or null when there was none. */
  previous: string | null;
  /** The note the write tried to make durable, as JSON. */
  attempted: string;
  at: number;
  /** Pending until reconciled; recoverable once the attempt did not win. */
  status: 'pending' | 'recoverable';
};

type JournalFile = Record<string, JournalEntry>;

/** Serialises every operation so a flush and a debounced write cannot interleave. */
let tail: Promise<unknown> = Promise.resolve();

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

function parseObject(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseNote(raw: string): Note | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const note = parsed as Partial<Note>;
    if (typeof note.id !== 'string' || typeof note.body !== 'string') return null;
    return {
      id: note.id,
      title: typeof note.title === 'string' ? note.title : '',
      body: note.body,
      linkedDocumentId:
        typeof note.linkedDocumentId === 'string' ? note.linkedDocumentId : note.id,
      createdAt: typeof note.createdAt === 'string' ? note.createdAt : new Date(0).toISOString(),
      updatedAt: typeof note.updatedAt === 'string' ? note.updatedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function parseNotes(raw: string): NotesFile {
  const notes: NotesFile = {};
  for (const [id, value] of Object.entries(parseObject(raw))) {
    const note = parseNote(JSON.stringify(value));
    if (note) notes[id] = note;
  }
  return notes;
}

function parseJournal(raw: string): JournalFile {
  const journal: JournalFile = {};
  for (const [id, value] of Object.entries(parseObject(raw))) {
    if (typeof value !== 'object' || value === null) continue;
    const entry = value as Partial<JournalEntry>;
    if (typeof entry.attempted !== 'string' || typeof entry.at !== 'number') continue;
    journal[id] = {
      noteId: id,
      previous: typeof entry.previous === 'string' ? entry.previous : null,
      attempted: entry.attempted,
      at: entry.at,
      status: entry.status === 'recoverable' ? 'recoverable' : 'pending',
    };
  }
  return journal;
}

/** The durable note, or null when this document has never had one. */
export function readNote(backend: NoteBackend, noteId: string): Promise<Note | null> {
  return serial(async () => parseNotes(await backend.readNotes())[noteId] ?? null);
}

async function write(backend: NoteBackend, note: Note): Promise<void> {
  const noteId = note.linkedDocumentId;
  if (!noteId) throw new Error('a desktop note has to be linked to a document');

  const notes = parseNotes(await backend.readNotes());
  const attempted = JSON.stringify(note);
  const previousNote = notes[noteId];
  const previous = previousNote ? JSON.stringify(previousNote) : null;
  if (previous === attempted) return;

  const journal = parseJournal(await backend.readJournal());
  journal[noteId] = { noteId, previous, attempted, at: Date.now(), status: 'pending' };
  // The attempt is durable before it can replace the durable note. If the write
  // below fails, this is what the next launch reconciles.
  await backend.writeJournal(JSON.stringify(journal));

  notes[noteId] = note;
  await backend.writeNotes(JSON.stringify(notes));

  // Applied. If this last write fails the entry stays pending, and reconcile
  // finds the durable note equal to the attempt and drops it.
  delete journal[noteId];
  await backend.writeJournal(JSON.stringify(journal));
}

export function saveNote(backend: NoteBackend, note: Note): Promise<void> {
  return serial(() => write(backend, note));
}

/**
 * Reconciles unfinished writes and returns the copy that belongs to `noteId`.
 *
 * Applied entries are dropped. Anything that did not become the durable note is
 * kept as a recovery copy, which the note panel offers to restore or discard.
 */
export function reconcileNote(
  backend: NoteBackend,
  noteId: string,
): Promise<NoteRecovery | null> {
  return serial(async () => {
    const notes = parseNotes(await backend.readNotes());
    const journal = parseJournal(await backend.readJournal());
    let changed = false;
    let recovery: NoteRecovery | null = null;

    for (const entry of Object.values(journal)) {
      const durable = notes[entry.noteId];
      const decision = decideJournalRecovery(
        entry.previous,
        entry.attempted,
        durable ? JSON.stringify(durable) : null,
      );

      if (decision.status === 'applied') {
        delete journal[entry.noteId];
        changed = true;
        continue;
      }

      if (entry.status !== 'recoverable') {
        entry.status = 'recoverable';
        changed = true;
      }

      if (entry.noteId === noteId) {
        const note = parseNote(entry.attempted);
        if (note) recovery = { noteId, note, at: entry.at };
      }
    }

    if (changed) await backend.writeJournal(JSON.stringify(journal));
    return recovery;
  });
}

/** Makes the recovered note durable again. A failed write leaves it recoverable. */
export function restoreNote(backend: NoteBackend, noteId: string): Promise<Note> {
  return serial(async () => {
    const journal = parseJournal(await backend.readJournal());
    const entry = journal[noteId];
    const note = entry ? parseNote(entry.attempted) : null;
    if (!note) throw new Error('there is no recovered note to restore');
    // `write` replaces this entry with a fresh pending one of its own, so a
    // failure here keeps the same text recoverable rather than losing it.
    await write(backend, note);
    return note;
  });
}

export function discardNote(backend: NoteBackend, noteId: string): Promise<void> {
  return serial(async () => {
    const journal = parseJournal(await backend.readJournal());
    if (!(noteId in journal)) return;
    delete journal[noteId];
    await backend.writeJournal(JSON.stringify(journal));
  });
}
