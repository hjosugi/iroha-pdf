import * as SQLite from 'expo-sqlite';

import {
  decideJournalRecovery,
  type Note,
  type PdfAnnotation,
  type WorkspaceDocument,
} from '@iroha-pdf/core';

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;
let initializationPromise: Promise<void> | undefined;

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync('iroha-pdf.db');
  return databasePromise;
}

async function setupDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT,
      source_revision TEXT,
      page_count INTEGER,
      size_bytes INTEGER,
      modified_at TEXT NOT NULL,
      last_opened_at TEXT
    );
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      linked_document_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(linked_document_id) REFERENCES documents(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL,
      page_index INTEGER NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS annotations_document_page
      ON annotations(document_id, page_index);
    CREATE TABLE IF NOT EXISTS write_journal (
      id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('note', 'annotation')),
      entity_id TEXT NOT NULL,
      previous_payload TEXT,
      attempted_payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending', 'applied', 'rolled-back', 'diverged', 'failed')),
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS write_journal_status
      ON write_journal(status, created_at);
  `);
  const documentColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(documents)');
  if (!documentColumns.some((column) => column.name === 'last_opened_at')) {
    await db.execAsync('ALTER TABLE documents ADD COLUMN last_opened_at TEXT;');
  }
  await recoverPendingWrites(db);
}

export async function initializeDatabase(): Promise<void> {
  initializationPromise ??= setupDatabase().catch((error) => {
    initializationPromise = undefined;
    throw error;
  });
  return initializationPromise;
}

type DocumentRow = {
  id: string;
  title: string;
  local_uri: string;
  source: WorkspaceDocument['source'];
  source_id: string | null;
  source_revision: string | null;
  page_count: number | null;
  size_bytes: number | null;
  modified_at: string;
  last_opened_at: string | null;
};

function mapDocument(row: DocumentRow): WorkspaceDocument {
  return {
    id: row.id,
    title: row.title,
    localUri: row.local_uri,
    mimeType: 'application/pdf',
    source: row.source,
    sourceId: row.source_id ?? undefined,
    sourceRevision: row.source_revision ?? undefined,
    pageCount: row.page_count ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    modifiedAt: row.modified_at,
  };
}

export async function saveDocument(document: WorkspaceDocument): Promise<void> {
  await initializeDatabase();
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO documents
      (id, title, local_uri, source, source_id, source_revision, page_count, size_bytes, modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       local_uri = excluded.local_uri,
       source = excluded.source,
       source_id = excluded.source_id,
       source_revision = excluded.source_revision,
       page_count = excluded.page_count,
       size_bytes = excluded.size_bytes,
       modified_at = excluded.modified_at`,
    document.id,
    document.title,
    document.localUri,
    document.source,
    document.sourceId ?? null,
    document.sourceRevision ?? null,
    document.pageCount ?? null,
    document.sizeBytes ?? null,
    document.modifiedAt,
  );
}

export async function listDocuments(): Promise<WorkspaceDocument[]> {
  await initializeDatabase();
  const db = await getDatabase();
  const rows = await db.getAllAsync<DocumentRow>(
    'SELECT * FROM documents ORDER BY COALESCE(last_opened_at, modified_at) DESC',
  );
  return rows.map(mapDocument);
}

export async function getDocument(id: string): Promise<WorkspaceDocument | null> {
  await initializeDatabase();
  const db = await getDatabase();
  const row = await db.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ?', id);
  return row ? mapDocument(row) : null;
}

export async function markDocumentOpened(id: string, openedAt = new Date().toISOString()): Promise<void> {
  await initializeDatabase();
  const db = await getDatabase();
  await db.runAsync('UPDATE documents SET last_opened_at = ? WHERE id = ?', openedAt, id);
}

type NoteRow = {
  id: string;
  title: string;
  body: string;
  linked_document_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    linkedDocumentId: row.linked_document_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createNote(title: string, linkedDocumentId?: string): Promise<Note> {
  const now = new Date().toISOString();
  const note: Note = {
    id: createId('note'),
    title,
    body: '',
    linkedDocumentId,
    createdAt: now,
    updatedAt: now,
  };
  await saveNote(note);
  return note;
}

export async function saveNote(note: Note): Promise<void> {
  await initializeDatabase();
  const db = await getDatabase();
  const previous = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', note.id);
  await journaledWrite(db, 'note', note.id, previous ? JSON.stringify(mapNote(previous)) : null, JSON.stringify(note), async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO notes
        (id, title, body, linked_document_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      note.id,
      note.title,
      note.body,
      note.linkedDocumentId ?? null,
      note.createdAt,
      note.updatedAt,
    );
  });
}

export async function listNotes(): Promise<Note[]> {
  await initializeDatabase();
  const db = await getDatabase();
  const rows = await db.getAllAsync<NoteRow>('SELECT * FROM notes ORDER BY updated_at DESC');
  return rows.map(mapNote);
}

export async function getNote(id: string): Promise<Note | null> {
  await initializeDatabase();
  const db = await getDatabase();
  const row = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', id);
  return row ? mapNote(row) : null;
}

export async function saveAnnotation(annotation: PdfAnnotation): Promise<void> {
  await initializeDatabase();
  const db = await getDatabase();
  const previous = await db.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM annotations WHERE id = ?',
    annotation.id,
  );
  const payload = JSON.stringify(annotation);
  await journaledWrite(db, 'annotation', annotation.id, previous?.payload ?? null, payload, async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO annotations (id, document_id, page_index, payload, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      annotation.id,
      annotation.documentId,
      annotation.pageIndex,
      payload,
      annotation.updatedAt,
    );
  });
}

export async function listAnnotations(documentId: string): Promise<PdfAnnotation[]> {
  await initializeDatabase();
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM annotations WHERE document_id = ? ORDER BY updated_at',
    documentId,
  );
  return rows.map((row) => JSON.parse(row.payload) as PdfAnnotation);
}

export async function deleteAnnotation(id: string): Promise<void> {
  await initializeDatabase();
  const db = await getDatabase();
  await db.runAsync('DELETE FROM annotations WHERE id = ?', id);
}

type JournalEntityType = 'note' | 'annotation';

type JournalRow = {
  id: string;
  entity_type: JournalEntityType;
  entity_id: string;
  previous_payload: string | null;
  attempted_payload: string;
  created_at: string;
};

export type RecoveryCopy = {
  journalId: string;
  entityType: JournalEntityType;
  entityId: string;
  payload: Note | PdfAnnotation;
  status: 'rolled-back' | 'diverged' | 'failed';
  createdAt: string;
};

async function journaledWrite(
  db: SQLite.SQLiteDatabase,
  entityType: JournalEntityType,
  entityId: string,
  previousPayload: string | null,
  attemptedPayload: string,
  write: () => Promise<void>,
): Promise<void> {
  const journalId = createId('journal');
  const createdAt = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO write_journal
      (id, entity_type, entity_id, previous_payload, attempted_payload, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    journalId,
    entityType,
    entityId,
    previousPayload,
    attemptedPayload,
    createdAt,
  );

  try {
    await db.withTransactionAsync(write);
    await db.runAsync(
      `UPDATE write_journal SET status = 'applied', resolved_at = ? WHERE id = ?`,
      new Date().toISOString(),
      journalId,
    );
    await db.runAsync('DELETE FROM write_journal WHERE id = ?', journalId);
  } catch (error) {
    try {
      await db.runAsync(
        `UPDATE write_journal SET status = 'failed', resolved_at = ? WHERE id = ?`,
        new Date().toISOString(),
        journalId,
      );
    } catch {
      // A locked/full database may also reject the status update. The pending
      // record is intentionally reconciled on the next successful startup.
    }
    throw error;
  }
}

async function currentSnapshot(db: SQLite.SQLiteDatabase, row: JournalRow): Promise<string | null> {
  if (row.entity_type === 'annotation') {
    const current = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM annotations WHERE id = ?',
      row.entity_id,
    );
    return current?.payload ?? null;
  }
  const current = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', row.entity_id);
  return current ? JSON.stringify(mapNote(current)) : null;
}

async function recoverPendingWrites(db: SQLite.SQLiteDatabase): Promise<void> {
  const pending = await db.getAllAsync<JournalRow>(
    `SELECT id, entity_type, entity_id, previous_payload, attempted_payload, created_at
     FROM write_journal WHERE status = 'pending' ORDER BY created_at`,
  );
  for (const row of pending) {
    const decision = decideJournalRecovery(
      row.previous_payload,
      row.attempted_payload,
      await currentSnapshot(db, row),
    );
    await db.runAsync(
      'UPDATE write_journal SET status = ?, resolved_at = ? WHERE id = ?',
      decision.status,
      new Date().toISOString(),
      row.id,
    );
    if (decision.status === 'applied') {
      await db.runAsync('DELETE FROM write_journal WHERE id = ?', row.id);
    }
  }
}

export async function listRecoveryCopies(): Promise<RecoveryCopy[]> {
  await initializeDatabase();
  const db = await getDatabase();
  const rows = await db.getAllAsync<JournalRow & { status: RecoveryCopy['status'] }>(
    `SELECT id, entity_type, entity_id, attempted_payload, status, created_at
     FROM write_journal
     WHERE status IN ('rolled-back', 'diverged', 'failed')
     ORDER BY created_at DESC`,
  );
  return rows.map((row) => ({
    journalId: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: JSON.parse(row.attempted_payload) as Note | PdfAnnotation,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function discardRecoveryCopy(journalId: string): Promise<void> {
  await initializeDatabase();
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM write_journal
     WHERE id = ? AND status IN ('rolled-back', 'diverged', 'failed')`,
    journalId,
  );
}

export async function restoreRecoveryCopy(journalId: string): Promise<void> {
  await initializeDatabase();
  const db = await getDatabase();
  const row = await db.getFirstAsync<JournalRow & { status: RecoveryCopy['status'] }>(
    `SELECT id, entity_type, entity_id, attempted_payload, status, created_at
     FROM write_journal
     WHERE id = ? AND status IN ('rolled-back', 'diverged', 'failed')`,
    journalId,
  );
  if (!row) throw new Error('Recovery copy no longer exists');
  if (row.entity_type === 'note') {
    await saveNote(JSON.parse(row.attempted_payload) as Note);
  } else {
    await saveAnnotation(JSON.parse(row.attempted_payload) as PdfAnnotation);
  }
  await db.runAsync('DELETE FROM write_journal WHERE id = ?', journalId);
}

export { createId };
