import { invoke } from '@tauri-apps/api/core';
import { ask, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { copyFile, exists, readFile, rename, writeFile } from '@tauri-apps/plugin-fs';

const PDF_FILTERS = [{ name: 'PDF', extensions: ['pdf'] }];

/**
 * Tauri 2 injects this on the window. It is absent when the same bundle is served
 * by `npm run dev:desktop:web`, where every filesystem call below would throw.
 */
export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function basename(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
}

/**
 * The pristine copy taken the first time a given file is overwritten. It is written
 * once and never replaced, so the bytes the user originally opened stay recoverable
 * no matter how many times they save afterwards.
 */
export function backupPathFor(path: string): string {
  return path.replace(/\.pdf$/i, '') + '.iroha-original.pdf';
}

/**
 * Where a save assembles its bytes before they become the document. Beside the target
 * rather than in a temporary directory, so that turning it into the document stays a
 * rename within one filesystem — across two, it would be a copy, and a copy is exactly
 * the half-written window this exists to close.
 */
export function partPathFor(path: string): string {
  return path.replace(/\.pdf$/i, '') + '.iroha-part.pdf';
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
 * A failed save therefore leaves the document exactly as it was. The incomplete bytes
 * stay under the name the error carries: deleting them would need a permission the app
 * deliberately does not hold, and a file the user can see and delete is a better answer
 * than one that vanished.
 */
export async function writePdfToDisk(path: string, buffer: ArrayBuffer): Promise<void> {
  const part = partPathFor(path);
  try {
    await writeFile(part, new Uint8Array(buffer));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${reason} (writing ${part})`, { cause: error });
  }
  await rename(part, path);
}

/**
 * Asks before doing something destructive. Uses the native dialog on the desktop and
 * falls back to the browser one, so the same call works in both runtimes.
 */
export async function confirmDiscard(message: string): Promise<boolean> {
  if (!isDesktopRuntime()) return window.confirm(message);
  return ask(message, { title: 'Unsaved changes', kind: 'warning', okLabel: 'Discard', cancelLabel: 'Keep editing' });
}
