/**
 * The copies behind the edit history (#101).
 *
 * The history already recorded what each save wrote — when, where, how big, how
 * many edits — but never the bytes, so the only restorable version was the
 * pristine `<name>.iroha-original.pdf`. This keeps one file per save, in the app
 * data directory through Tauri, and restores it to a path the user names.
 *
 * Desktop only: the browser build has no file store and never records a revision
 * whose copy could be restored. A failed copy does not fail the save — the document
 * is on disk, and the history simply shows that one revision without a button.
 */
import { invoke } from '@tauri-apps/api/core';

import {
  allowSaveSiblings,
  isDesktopRuntime,
  pickSaveLocation,
  writePdfToDisk,
} from './file-bridge';

/** Matches the alphabet `revision_id_is_safe` in src-tauri/src/lib.rs accepts. */
function newRevisionId(): string {
  return `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stores the bytes a save just wrote, and returns the id the history keeps. */
export async function saveRevision(buffer: ArrayBuffer): Promise<string | null> {
  if (!isDesktopRuntime()) return null;
  const id = newRevisionId();
  try {
    await invoke('write_revision', new Uint8Array(buffer), {
      headers: { 'x-revision-id': id },
    });
    return id;
  } catch (error) {
    console.warn('Iroha PDF: the revision copy could not be stored', error);
    return null;
  }
}

export type RestoreRevisionOutcome =
  | { status: 'written'; path: string }
  | { status: 'cancelled' };

/**
 * Reads a stored revision and writes it where the user chooses.
 *
 * Never the document being edited: restoring over the open file would fight the
 * draft, the annotation engine and the history all at once. A restored copy is a
 * new file, exactly like every other produced document.
 */
export async function restoreRevision(
  revisionId: string,
  suggestedName: string,
): Promise<RestoreRevisionOutcome> {
  const bytes = await invoke<ArrayBuffer>('read_revision', { id: revisionId });
  const target = await pickSaveLocation(suggestedName);
  if (!target) return { status: 'cancelled' };
  await allowSaveSiblings(target);
  await writePdfToDisk(target, bytes);
  return { status: 'written', path: target };
}
