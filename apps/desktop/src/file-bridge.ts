import { ask, open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { copyFile, exists, readFile, writeFile } from '@tauri-apps/plugin-fs';

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

export async function writePdfToDisk(path: string, buffer: ArrayBuffer): Promise<void> {
  await writeFile(path, new Uint8Array(buffer));
}

/**
 * Asks before doing something destructive. Uses the native dialog on the desktop and
 * falls back to the browser one, so the same call works in both runtimes.
 */
export async function confirmDiscard(message: string): Promise<boolean> {
  if (!isDesktopRuntime()) return window.confirm(message);
  return ask(message, { title: 'Unsaved changes', kind: 'warning', okLabel: 'Discard', cancelLabel: 'Keep editing' });
}
