import * as SQLite from 'expo-sqlite';

import type { Note, PdfAnnotation, WorkspaceDocument } from '@iroha-pdf/core';

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= SQLite.openDatabaseAsync('iroha-pdf.db');
  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
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
      modified_at TEXT NOT NULL
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
  `);
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
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO documents
      (id, title, local_uri, source, source_id, source_revision, page_count, size_bytes, modified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  const rows = await db.getAllAsync<DocumentRow>('SELECT * FROM documents ORDER BY modified_at DESC');
  return rows.map(mapDocument);
}

export async function getDocument(id: string): Promise<WorkspaceDocument | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ?', id);
  return row ? mapDocument(row) : null;
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
  const db = await getDatabase();
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
}

export async function listNotes(): Promise<Note[]> {
  await initializeDatabase();
  const db = await getDatabase();
  const rows = await db.getAllAsync<NoteRow>('SELECT * FROM notes ORDER BY updated_at DESC');
  return rows.map(mapNote);
}

export async function getNote(id: string): Promise<Note | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<NoteRow>('SELECT * FROM notes WHERE id = ?', id);
  return row ? mapNote(row) : null;
}

export async function saveAnnotation(annotation: PdfAnnotation): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO annotations (id, document_id, page_index, payload, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    annotation.id,
    annotation.documentId,
    annotation.pageIndex,
    JSON.stringify(annotation),
    annotation.updatedAt,
  );
}

export async function listAnnotations(documentId: string): Promise<PdfAnnotation[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM annotations WHERE document_id = ? ORDER BY updated_at',
    documentId,
  );
  return rows.map((row) => JSON.parse(row.payload) as PdfAnnotation);
}

export { createId };
