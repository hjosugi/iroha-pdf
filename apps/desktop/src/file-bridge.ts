import { invoke } from '@tauri-apps/api/core';
import { ask, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { copyFile, exists, readFile, rename, writeFile } from '@tauri-apps/plugin-fs';

import { backupPathFor, basename, partPathFor } from './paths';

// Re-exported so callers keep one import for "the desktop file layer"; the rules
// themselves live in ./paths, which a test can import without a Tauri runtime.
export { backupPathFor, basename, partPathFor };

const PDF_FILTERS = [{ name: 'PDF', extensions: ['pdf'] }];

/**
 * Tauri 2 injects this on the window. It is absent when the same bundle is served
 * by `npm run dev:desktop:web`, where every filesystem call below would throw.
 */
export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Puts the two files a save writes beside the document into the filesystem scope.
 *
 * The dialog grants exactly the path it returned, and neither the pristine copy nor the
 * partial file is ever named in a dialog — so without this they are forbidden paths and
 * the save fails before it has written anything. The Rust side grants only names
 * derived from a file the user has already chosen.
 */
export async function allowSaveSiblings(path: string): Promise<void> {
  for (const derived of [backupPathFor(path), partPathFor(path)]) {
    await invoke('allow_derived_file', { source: path, derived });
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const exact =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  return exact ? (bytes.buffer as ArrayBuffer) : (bytes.slice().buffer as ArrayBuffer);
}

export type OpenedFile = {
  path: string;
  name: string;
  buffer: ArrayBuffer;
};

export async function readPdfFromDisk(path: string): Promise<OpenedFile> {
  const bytes = await readFile(path);
  return { path, name: basename(path), buffer: toArrayBuffer(bytes) };
}

/** Returns null when the user dismisses the dialog. */
export async function pickPdfFromDisk(): Promise<OpenedFile | null> {
  const selected = await openDialog({
    multiple: false,
    directory: false,
    filters: PDF_FILTERS,
  });
  if (typeof selected !== 'string') return null;
  return readPdfFromDisk(selected);
}

/** Returns null when the user dismisses the dialog. */
export async function pickSaveLocation(defaultName: string): Promise<string | null> {
  return saveDialog({ defaultPath: defaultName, filters: PDF_FILTERS });
}

/**
 * Copies the current on-disk bytes aside before the first overwrite of `path`.
 * Returns the backup path when one was created, or null when it already existed.
 */
export async function ensureOriginalBackup(path: string): Promise<string | null> {
  const backup = backupPathFor(path);
  if (await exists(backup)) return null;
  await copyFile(path, backup);
  return backup;
}

/**
 * Replaces `path` with `buffer` without ever leaving it half-written.
 *
 * `writeFile` empties its target and then streams into it, so a crash or a full disk
 * partway through left a fragment where the document was — the one outcome a document
 * editor must not produce. The bytes go beside it first and only become the document
 * once every one of them is on disk, which `rename` does in a single step.
 *
 * A failed save therefore leaves the document exactly as it was, and takes its own
 * half-written bytes with it. Those bytes are never worth keeping: what an interrupted
 * edit is recovered from is the draft, not this. Only when the clean-up itself fails
 * does the file stay, and then the error says where.
 */
export async function writePdfToDisk(path: string, buffer: ArrayBuffer): Promise<void> {
  const part = partPathFor(path);
  try {
    await writeFile(part, new Uint8Array(buffer));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason}${await describePartFile(path, part)}`, { cause: error });
  }
  await rename(part, path);
}

/**
 * Clears the partial left by a failed write, and says what the user is left with.
 *
 * Reported rather than thrown: the write already failed, and that is the failure worth
 * surfacing. Losing the clean-up on top only changes whether a file is lying around.
 */
async function describePartFile(path: string, part: string): Promise<string> {
  try {
    await invoke('discard_part_file', { source: path });
    return '';
  } catch {
    return ` (the incomplete copy is at ${part})`;
  }
}

/**
 * Asks before doing something destructive. Uses the native dialog on the desktop and
 * falls back to the browser one, so the same call works in both runtimes.
 */
export async function confirmDiscard(message: string): Promise<boolean> {
  if (!isDesktopRuntime()) return window.confirm(message);
  return ask(message, { title: 'Unsaved changes', kind: 'warning', okLabel: 'Discard', cancelLabel: 'Keep editing' });
}
