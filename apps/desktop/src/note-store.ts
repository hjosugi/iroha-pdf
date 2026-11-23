/**
 * Where a desktop linked note lives.
 *
 * The journal and its rules are in `./note-journal`; this module chooses the
 * backend. In the desktop runtime that is two files in the app's private data
 * directory, written by Tauri commands, so clearing the webview's site data no
 * longer takes the note with it (#239). The browser build has no filesystem, so
 * it keeps the same two documents in `localStorage`; the browser was always
 * ephemeral by nature and is not the shipped desktop application.
 *
 * The key is the file path, not the document id. The document manager makes a new
 * `doc-<time>-<random>` id every time a file is opened, so a note keyed by it would
 * not come back on the next launch even though the bytes were still on disk. The
 * path is the same file across restarts; documents without one (the browser build,
 * the bundled sample) fall back to the per-session id.
 *
 * Notes written by the old localStorage-only version are migrated on first read.
 */
import { invoke } from '@tauri-apps/api/core';
import type { Note } from '@iroha-pdf/core';

import { isDesktopRuntime } from './file-bridge';
import { t } from './i18n';
import { storageKey } from './local-storage';
import {
  discardNote,
  readNote,
  reconcileNote,
  restoreNote,
  saveNote,
  type NoteBackend,
  type NoteRecovery,
} from './note-journal';

export type { NoteRecovery };

const desktopBackend: NoteBackend = {
  readNotes: () => invoke<string>('read_note_store'),
  writeNotes: (contents) => invoke('write_note_store', { contents }),
  readJournal: () => invoke<string>('read_note_journal'),
  writeJournal: (contents) => invoke('write_note_journal', { contents }),
};

function readBrowser(space: 'note-store' | 'note-journal'): string {
  try {
    return localStorage.getItem(storageKey(space, 'notes')) ?? '{}';
  } catch {
    return '{}';
  }
}

function writeBrowser(space: 'note-store' | 'note-journal', contents: string): void {
  localStorage.setItem(storageKey(space, 'notes'), contents);
}

const browserBackend: NoteBackend = {
  readNotes: async () => readBrowser('note-store'),
  writeNotes: async (contents) => writeBrowser('note-store', contents),
  readJournal: async () => readBrowser('note-journal'),
  writeJournal: async (contents) => writeBrowser('note-journal', contents),
};

function backend(): NoteBackend {
  return isDesktopRuntime() ? desktopBackend : browserBackend;
}

export function blankLinkedNote(noteKey: string): Note {
  const now = new Date().toISOString();
  return {
    id: `desktop-note:${noteKey}`,
    title: t('note.linked'),
    body: '',
    linkedDocumentId: noteKey,
    createdAt: now,
    updatedAt: now,
  };
}

function normalize(stored: Note, noteKey: string): Note {
  const blank = blankLinkedNote(noteKey);
  return {
    ...blank,
    id: stored.id || blank.id,
    title: stored.title || blank.title,
    body: stored.body,
    linkedDocumentId: noteKey,
    createdAt: stored.createdAt || blank.createdAt,
    updatedAt: stored.updatedAt || blank.updatedAt,
  };
}

/** The note the pre-journal version wrote, if it is still here. */
function readLegacyNote(noteKey: string): Note | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey('note', noteKey));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Note>;
    if (typeof parsed.body !== 'string') return null;
    return normalize(parsed as Note, noteKey);
  } catch {
    // Even older versions stored only the body.
    return { ...blankLinkedNote(noteKey), body: raw };
  }
}

/**
 * The stored note, a migrated legacy note, or a blank one.
 *
 * A migration that cannot be written is not a loss: the legacy value is still
 * returned and the panel's next save retries the store.
 */
export async function loadLinkedNote(noteKey: string): Promise<Note> {
  const stored = await readNote(backend(), noteKey);
  if (stored) return normalize(stored, noteKey);

  const legacy = readLegacyNote(noteKey);
  if (!legacy) return blankLinkedNote(noteKey);

  try {
    await saveNote(backend(), legacy);
    try {
      localStorage.removeItem(storageKey('note', noteKey));
    } catch {
      // The store has it now; a leftover copy only costs a prompt-less migration.
    }
  } catch (error) {
    console.warn('Iroha PDF: the note could not be moved to the note store', error);
  }
  return legacy;
}

export function saveLinkedNote(note: Note): Promise<void> {
  return saveNote(backend(), note);
}

export function reconcileLinkedNote(noteKey: string): Promise<NoteRecovery | null> {
  return reconcileNote(backend(), noteKey);
}

export function restoreLinkedNote(noteKey: string): Promise<Note> {
  return restoreNote(backend(), noteKey);
}

export function discardLinkedNote(noteKey: string): Promise<void> {
  return discardNote(backend(), noteKey);
}
