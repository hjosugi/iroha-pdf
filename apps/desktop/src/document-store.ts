/**
 * Tracks, per open document, the file it came from and what has been done to it.
 *
 * The annotation plugin exposes undo/redo but no readable list of past edits, and the
 * export plugin hands back bytes without recording where they went. Both of those are
 * needed to answer "what did I change, and when did it reach disk?", so they are kept
 * here instead.
 */

import { clearDraft, loadDraft, type Draft } from './draft-store';

export type EditEntry = {
  at: number;
  kind: 'create' | 'update' | 'delete';
  label: string;
  pageIndex: number;
};

export type SaveRevision = {
  at: number;
  path: string;
  byteLength: number;
  /** Number of recorded edits that preceded this save. */
  editCount: number;
  kind: 'save' | 'save-as';
};

export type DocumentFile = {
  /** Filesystem path when opened through the desktop runtime; null in browser mode. */
  path: string | null;
  /** Edits made since the last save. */
  pendingEdits: number;
  edits: EditEntry[];
  revisions: SaveRevision[];
  /** A draft that outlived the app, waiting for the user to accept or throw away. */
  recovery: Draft | null;
};

const EMPTY: DocumentFile = Object.freeze({
  path: null,
  pendingEdits: 0,
  edits: [],
  revisions: [],
  recovery: null,
});

const MAX_EDITS = 500;
const MAX_REVISIONS = 100;

const files = new Map<string, DocumentFile>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDocumentFile(documentId: string): DocumentFile {
  return files.get(documentId) ?? EMPTY;
}

function patch(documentId: string, changes: Partial<DocumentFile>): DocumentFile {
  const next = { ...(files.get(documentId) ?? EMPTY), ...changes };
  files.set(documentId, next);
  emit();
  return next;
}

function historyKey(path: string): string {
  return `iroha-pdf:history:${path}`;
}

/** History is a convenience, never a correctness dependency — losing it must not break saving. */
function loadHistory(path: string): Pick<DocumentFile, 'edits' | 'revisions'> {
  try {
    const raw = localStorage.getItem(historyKey(path));
    if (!raw) return { edits: [], revisions: [] };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { edits: [], revisions: [] };
    const { edits, revisions } = parsed as Partial<DocumentFile>;
    return {
      edits: Array.isArray(edits) ? edits : [],
      revisions: Array.isArray(revisions) ? revisions : [],
    };
  } catch {
    return { edits: [], revisions: [] };
  }
}

function persistHistory(file: DocumentFile): void {
  if (!file.path) return;
  try {
    localStorage.setItem(
      historyKey(file.path),
      JSON.stringify({ edits: file.edits, revisions: file.revisions }),
    );
  } catch {
    // Quota exceeded, or storage disabled. The in-memory timeline still works.
  }
}

/**
 * Associates an open document with the file it was read from, restoring its history.
 *
 * A leftover draft means the app stopped before its annotations reached the file, so
 * it is surfaced for the user to accept or discard rather than applied silently —
 * silently changing a document someone just opened is its own kind of data loss.
 */
export function registerOpenedFile(documentId: string, path: string | null): void {
  const history = path ? loadHistory(path) : { edits: [], revisions: [] };
  const draft = path ? loadDraft(path) : null;
  patch(documentId, {
    path,
    pendingEdits: 0,
    recovery: draft && draft.items.length > 0 ? draft : null,
    ...history,
  });
}

export function dismissRecovery(documentId: string): void {
  patch(documentId, { recovery: null });
}

export function recordEdit(documentId: string, entry: EditEntry): void {
  const current = files.get(documentId) ?? EMPTY;
  const next = patch(documentId, {
    edits: [...current.edits, entry].slice(-MAX_EDITS),
    pendingEdits: current.pendingEdits + 1,
  });
  persistHistory(next);
}

export function recordSave(documentId: string, revision: SaveRevision): void {
  const current = files.get(documentId) ?? EMPTY;
  const next = patch(documentId, {
    path: revision.path,
    revisions: [...current.revisions, revision].slice(-MAX_REVISIONS),
    pendingEdits: 0,
    recovery: null,
  });
  persistHistory(next);
  // The annotations are in the file now, so the draft has nothing left to protect.
  if (current.path) clearDraft(current.path);
  clearDraft(revision.path);
}

export function forgetDocument(documentId: string): void {
  if (files.delete(documentId)) emit();
}

/** Documents holding edits that have never reached disk. */
export function documentsWithUnsavedEdits(): string[] {
  return [...files.entries()]
    .filter(([, file]) => file.pendingEdits > 0)
    .map(([documentId]) => documentId);
}
