/// <reference types="node" />

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HighlightAnnotation, Note, WorkspaceDocument } from '@iroha-pdf/core';

import type * as TestSqlite from '../../test-sqlite';

// expo-sqlite is a native module and cannot load off a device, so the tests drive the
// same engine through node:sqlite instead. See test-sqlite.ts.
vi.mock('expo-sqlite', () => import('../../test-sqlite'));

/**
 * The double is reached through the mocked specifier, because that is the instance
 * `database.ts` was handed: `vi.resetModules()` leaves the mock registry alone, so a
 * second import of the file behind it would be a different copy with its own state.
 */
let sqlite: typeof TestSqlite;
let database: typeof import('./database');
let directory: string;

/** A cold start. `database.ts` loses its cached connection and its setup promise. */
async function launch(): Promise<void> {
  vi.resetModules();
  database = await import('./database');
}

beforeEach(async () => {
  sqlite = (await import('expo-sqlite')) as unknown as typeof TestSqlite;
  directory = mkdtempSync(join(tmpdir(), 'iroha-pdf-database-'));
  sqlite.useDatabaseFile(join(directory, 'iroha-pdf.db'));
  await launch();
});

afterEach(() => {
  sqlite.closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

function documentFixture(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id: 'doc-1',
    title: 'Lease agreement',
    localUri: 'file:///documents/doc-1.pdf',
    mimeType: 'application/pdf',
    source: 'external-provider',
    modifiedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Field order matters as much as the values: recovery compares serialised snapshots,
 * and the app builds the current one from the same fields in this order.
 */
function noteFixture(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Meeting',
    body: 'first draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function annotationFixture(overrides: Partial<HighlightAnnotation> = {}): HighlightAnnotation {
  return {
    id: 'ann-1',
    documentId: 'doc-1',
    pageIndex: 2,
    color: '#FFDD55',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    kind: 'highlight',
    position: { x: 10, y: 20 },
    width: 120,
    height: 14,
    opacity: 0.4,
    ...overrides,
  };
}

type SeededEntry = {
  id: string;
  entityType: 'note' | 'annotation';
  entityId: string;
  previousPayload?: string | null;
  attemptedPayload: string;
  status?: 'pending' | 'applied' | 'rolled-back' | 'diverged' | 'failed';
  createdAt: string;
};

/** The row a process kill leaves behind: a write that was announced and never resolved. */
function seedJournalEntry(entry: SeededEntry): void {
  sqlite
    .raw()
    .prepare(
      `INSERT INTO write_journal
        (id, entity_type, entity_id, previous_payload, attempted_payload, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.id,
      entry.entityType,
      entry.entityId,
      entry.previousPayload ?? null,
      entry.attemptedPayload,
      entry.status ?? 'pending',
      entry.createdAt,
    );
}

function journalRows(): { id: string; entity_id: string; status: string }[] {
  return sqlite
    .raw()
    .prepare('SELECT id, entity_id, status FROM write_journal ORDER BY created_at')
    .all() as { id: string; entity_id: string; status: string }[];
}

function columnNames(table: string): string[] {
  return sqlite
    .raw()
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((column) => String((column as { name: unknown }).name));
}

function schemaObjects(type: 'table' | 'index'): string[] {
  return sqlite
    .raw()
    .prepare('SELECT name FROM sqlite_master WHERE type = ?')
    .all(type)
    .map((row) => String((row as { name: unknown }).name));
}

function storedDocumentColumn(id: string, column: string): unknown {
  const row = sqlite.raw().prepare(`SELECT ${column} AS value FROM documents WHERE id = ?`).get(id);
  return (row as { value: unknown } | undefined)?.value;
}

/** How often the schema has been laid down since the database file was chosen. */
function schemaRuns(): number {
  return sqlite.issuedStatements().filter((sql) => sql.includes('CREATE TABLE IF NOT EXISTS documents')).length;
}

describe('setupDatabase', () => {
  it('puts the database in WAL, which is what survives a kill mid-write', async () => {
    await database.initializeDatabase();
    expect(sqlite.raw().prepare('PRAGMA journal_mode').get()).toMatchObject({ journal_mode: 'wal' });
  });

  it('enforces foreign keys, so annotations do not outlive their document', async () => {
    await database.saveDocument(documentFixture());
    await database.saveAnnotation(annotationFixture());
    sqlite.raw().prepare('DELETE FROM documents WHERE id = ?').run('doc-1');
    expect(await database.listAnnotations('doc-1')).toEqual([]);
  });

  it('creates every table and index the app reads', async () => {
    await database.initializeDatabase();
    expect(schemaObjects('table')).toEqual(
      expect.arrayContaining(['documents', 'notes', 'annotations', 'write_journal']),
    );
    expect(schemaObjects('index')).toEqual(
      expect.arrayContaining(['annotations_document_page', 'write_journal_status']),
    );
  });

  it('adds last_opened_at to a documents table created before that column existed', async () => {
    // The shipped 0.1 schema, which CREATE TABLE IF NOT EXISTS will not touch.
    sqlite.raw().exec(`
      CREATE TABLE documents (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        local_uri TEXT NOT NULL,
        source TEXT NOT NULL,
        source_id TEXT,
        source_revision TEXT,
        page_count INTEGER,
        size_bytes INTEGER,
        modified_at TEXT NOT NULL
      );
    `);
    sqlite
      .raw()
      .prepare('INSERT INTO documents (id, title, local_uri, source, modified_at) VALUES (?, ?, ?, ?, ?)')
      .run('doc-old', 'Imported earlier', 'file:///documents/doc-old.pdf', 'local', '2026-01-01T00:00:00.000Z');

    await database.initializeDatabase();

    expect(columnNames('documents')).toContain('last_opened_at');
    // Upgrading is not allowed to cost the user the library they already had.
    expect((await database.listDocuments()).map((item) => item.id)).toEqual(['doc-old']);
    await database.markDocumentOpened('doc-old', '2026-02-01T00:00:00.000Z');
    expect(storedDocumentColumn('doc-old', 'last_opened_at')).toBe('2026-02-01T00:00:00.000Z');
  });

  it('keeps notes and documents when it runs again over a database it already set up', async () => {
    await database.saveDocument(documentFixture());
    await database.saveNote(noteFixture());

    await launch();

    expect((await database.listDocuments()).map((item) => item.id)).toEqual(['doc-1']);
    expect((await database.listNotes()).map((item) => item.id)).toEqual(['note-1']);
  });
});

describe('initializeDatabase', () => {
  it('sets the schema up once however many callers race for it', async () => {
    await Promise.all([
      database.initializeDatabase(),
      database.saveDocument(documentFixture()),
      database.listNotes(),
      database.listRecoveryCopies(),
    ]);
    expect(schemaRuns()).toBe(1);
  });

  it('runs setup again after a failure instead of handing the retry the same error', async () => {
    await database.initializeDatabase();
    // A write left unresolved by a kill: reconciling it is the part of setup that
    // needs the database to itself.
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'note',
      entityId: 'note-1',
      attemptedPayload: JSON.stringify(noteFixture()),
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    await launch();
    sqlite.holdWriteLock();
    await expect(database.initializeDatabase()).rejects.toThrow(/locked/);
    sqlite.releaseWriteLock();

    await expect(database.initializeDatabase()).resolves.toBeUndefined();
    expect(journalRows()).toEqual([{ id: 'journal-1', entity_id: 'note-1', status: 'rolled-back' }]);
  });
});

describe('saveDocument', () => {
  it('updates the fields that changed on a second save', async () => {
    await database.saveDocument(documentFixture());
    await database.saveDocument(documentFixture({ title: 'Lease agreement (signed)', sourceRevision: '7' }));

    const stored = await database.getDocument('doc-1');
    expect(stored).toMatchObject({ title: 'Lease agreement (signed)', sourceRevision: '7' });
    expect(await database.listDocuments()).toHaveLength(1);
  });

  it('does not clear the last opened time, which is not its to write', async () => {
    await database.saveDocument(documentFixture());
    await database.markDocumentOpened('doc-1', '2026-03-01T00:00:00.000Z');

    // A re-import or a Drive revision check re-saves the document without ever
    // touching the reading history.
    await database.saveDocument(documentFixture({ sourceRevision: '9' }));

    expect(storedDocumentColumn('doc-1', 'last_opened_at')).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('listDocuments', () => {
  it('puts the most recently opened document first', async () => {
    await database.saveDocument(documentFixture({ id: 'doc-1', modifiedAt: '2026-01-01T00:00:00.000Z' }));
    await database.saveDocument(documentFixture({ id: 'doc-2', modifiedAt: '2026-01-02T00:00:00.000Z' }));
    await database.saveDocument(documentFixture({ id: 'doc-3', modifiedAt: '2026-01-03T00:00:00.000Z' }));

    await database.markDocumentOpened('doc-1', '2026-05-01T00:00:00.000Z');
    await database.markDocumentOpened('doc-2', '2026-04-01T00:00:00.000Z');

    // doc-3 was never opened, so its modified time is what places it.
    expect((await database.listDocuments()).map((item) => item.id)).toEqual(['doc-1', 'doc-2', 'doc-3']);
  });

  it('keeps a document that was opened long ago below a newer import', async () => {
    await database.saveDocument(documentFixture({ id: 'doc-old', modifiedAt: '2026-01-01T00:00:00.000Z' }));
    await database.markDocumentOpened('doc-old', '2026-01-05T00:00:00.000Z');
    await database.saveDocument(documentFixture({ id: 'doc-new', modifiedAt: '2026-06-01T00:00:00.000Z' }));

    expect((await database.listDocuments()).map((item) => item.id)).toEqual(['doc-new', 'doc-old']);
  });
});

describe('journaledWrite', () => {
  it('leaves nothing behind once the write lands', async () => {
    await database.saveNote(noteFixture());
    expect(journalRows()).toEqual([]);
    expect(await database.listRecoveryCopies()).toEqual([]);
  });

  it('keeps the attempted edit as a recovery copy when the write is rejected', async () => {
    const annotation = annotationFixture({ documentId: 'doc-gone' });
    await expect(database.saveAnnotation(annotation)).rejects.toThrow(/FOREIGN KEY/);

    const copies = await database.listRecoveryCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ entityType: 'annotation', entityId: 'ann-1', status: 'failed' });
    expect(copies[0]?.payload).toEqual(annotation);
    expect(await database.listAnnotations('doc-gone')).toEqual([]);
  });

  it('says so when the interrupted edit could not even be kept as a recovery copy', async () => {
    await database.saveNote(noteFixture());

    // Another connection takes the database at the moment the write starts, so the
    // write and the journal's own bookkeeping are both refused.
    sqlite.onNextTransaction(() => sqlite.holdWriteLock());
    const failure = await database
      .saveNote(noteFixture({ body: 'second draft', updatedAt: '2026-01-02T00:00:00.000Z' }))
      .then(() => null)
      .catch((error: unknown) => error as Error);
    sqlite.releaseWriteLock();

    expect(failure?.message).toContain('database is locked');
    expect(failure?.message).toMatch(/recovery copy/);
    expect(failure?.cause).toBeInstanceOf(Error);
    // The edit is not on hand yet, which is exactly what the message has to admit.
    expect(await database.listRecoveryCopies()).toEqual([]);
    expect((await database.getNote('note-1'))?.body).toBe('first draft');

    // And the promise that message makes is kept.
    await launch();
    const copies = await database.listRecoveryCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ entityType: 'note', entityId: 'note-1', status: 'rolled-back' });
    expect((copies[0]?.payload as Note).body).toBe('second draft');
  });
});

describe('recoverPendingWrites', () => {
  it('clears an entry whose write had already landed when the app died', async () => {
    const applied = noteFixture({ body: 'second draft', updatedAt: '2026-01-02T00:00:00.000Z' });
    await database.saveNote(applied);
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'note',
      entityId: 'note-1',
      previousPayload: JSON.stringify(noteFixture()),
      attemptedPayload: JSON.stringify(applied),
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await launch();
    await database.initializeDatabase();

    // Nothing to decide: the attempted value is already the durable one.
    expect(journalRows()).toEqual([]);
    expect(await database.listRecoveryCopies()).toEqual([]);
  });

  it('offers the interrupted edit back when the stored note is still the old one', async () => {
    await database.saveNote(noteFixture());
    const attempted = noteFixture({ body: 'second draft', updatedAt: '2026-01-02T00:00:00.000Z' });
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'note',
      entityId: 'note-1',
      previousPayload: JSON.stringify(noteFixture()),
      attemptedPayload: JSON.stringify(attempted),
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await launch();

    const copies = await database.listRecoveryCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ journalId: 'journal-1', status: 'rolled-back' });
    expect(copies[0]?.payload).toEqual(attempted);
    // The durable note is still the one the user last saw saved.
    expect((await database.getNote('note-1'))?.body).toBe('first draft');
  });

  it('marks the entry diverged when the stored note is neither snapshot', async () => {
    await database.saveNote(noteFixture({ body: 'edited on another device', updatedAt: '2026-01-03T00:00:00.000Z' }));
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'note',
      entityId: 'note-1',
      previousPayload: JSON.stringify(noteFixture()),
      attemptedPayload: JSON.stringify(noteFixture({ body: 'second draft', updatedAt: '2026-01-02T00:00:00.000Z' })),
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await launch();

    expect(await database.listRecoveryCopies()).toMatchObject([{ journalId: 'journal-1', status: 'diverged' }]);
  });

  it('reconciles annotations against their stored payload', async () => {
    await database.saveDocument(documentFixture());
    await database.saveAnnotation(annotationFixture());
    const attempted = annotationFixture({ opacity: 0.9, updatedAt: '2026-01-02T00:00:00.000Z' });
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'annotation',
      entityId: 'ann-1',
      previousPayload: JSON.stringify(annotationFixture()),
      attemptedPayload: JSON.stringify(attempted),
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await launch();

    const copies = await database.listRecoveryCopies();
    expect(copies).toMatchObject([{ entityType: 'annotation', status: 'rolled-back' }]);
    expect(copies[0]?.payload).toEqual(attempted);
  });
});

describe('listRecoveryCopies', () => {
  it('shows only the entries that still need a decision, newest first', async () => {
    await database.initializeDatabase();
    const payload = JSON.stringify(noteFixture());
    seedJournalEntry({ id: 'j-rolled', entityType: 'note', entityId: 'n1', attemptedPayload: payload, status: 'rolled-back', createdAt: '2026-01-01T00:00:00.000Z' });
    seedJournalEntry({ id: 'j-diverged', entityType: 'note', entityId: 'n2', attemptedPayload: payload, status: 'diverged', createdAt: '2026-01-02T00:00:00.000Z' });
    seedJournalEntry({ id: 'j-failed', entityType: 'note', entityId: 'n3', attemptedPayload: payload, status: 'failed', createdAt: '2026-01-03T00:00:00.000Z' });
    seedJournalEntry({ id: 'j-applied', entityType: 'note', entityId: 'n4', attemptedPayload: payload, status: 'applied', createdAt: '2026-01-04T00:00:00.000Z' });

    expect((await database.listRecoveryCopies()).map((copy) => copy.journalId)).toEqual([
      'j-failed',
      'j-diverged',
      'j-rolled',
    ]);
  });
});

describe('restoreRecoveryCopy', () => {
  it('writes the attempted note back and clears the copy', async () => {
    await database.saveNote(noteFixture());
    const attempted = noteFixture({ body: 'second draft', updatedAt: '2026-01-02T00:00:00.000Z' });
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'note',
      entityId: 'note-1',
      attemptedPayload: JSON.stringify(attempted),
      status: 'rolled-back',
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await database.restoreRecoveryCopy('journal-1');

    expect(await database.getNote('note-1')).toEqual(attempted);
    expect(await database.listRecoveryCopies()).toEqual([]);
    expect(journalRows()).toEqual([]);
  });

  it('writes the attempted annotation back', async () => {
    await database.saveDocument(documentFixture());
    await database.saveAnnotation(annotationFixture());
    const attempted = annotationFixture({ opacity: 0.9, updatedAt: '2026-01-02T00:00:00.000Z' });
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'annotation',
      entityId: 'ann-1',
      attemptedPayload: JSON.stringify(attempted),
      status: 'diverged',
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await database.restoreRecoveryCopy('journal-1');

    expect(await database.listAnnotations('doc-1')).toEqual([attempted]);
    expect(journalRows()).toEqual([]);
  });

  it('refuses a copy that is no longer there', async () => {
    await database.initializeDatabase();
    await expect(database.restoreRecoveryCopy('journal-gone')).rejects.toThrow('Recovery copy no longer exists');
  });

  it('refuses an entry that is still pending, because that write is not finished', async () => {
    await database.saveNote(noteFixture());
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'note',
      entityId: 'note-1',
      attemptedPayload: JSON.stringify(noteFixture({ body: 'in flight' })),
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await expect(database.restoreRecoveryCopy('journal-1')).rejects.toThrow('Recovery copy no longer exists');
    expect((await database.getNote('note-1'))?.body).toBe('first draft');
  });
});

describe('discardRecoveryCopy', () => {
  it('drops the copy and leaves the stored note alone', async () => {
    await database.saveNote(noteFixture());
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'note',
      entityId: 'note-1',
      attemptedPayload: JSON.stringify(noteFixture({ body: 'second draft' })),
      status: 'rolled-back',
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await database.discardRecoveryCopy('journal-1');

    expect(journalRows()).toEqual([]);
    expect((await database.getNote('note-1'))?.body).toBe('first draft');
  });

  it('leaves a pending entry alone, so an unfinished write is still reconciled', async () => {
    await database.saveNote(noteFixture());
    seedJournalEntry({
      id: 'journal-1',
      entityType: 'note',
      entityId: 'note-1',
      attemptedPayload: JSON.stringify(noteFixture({ body: 'in flight' })),
      createdAt: '2026-01-02T00:00:00.000Z',
    });

    await database.discardRecoveryCopy('journal-1');

    expect(journalRows()).toEqual([{ id: 'journal-1', entity_id: 'note-1', status: 'pending' }]);
  });
});
