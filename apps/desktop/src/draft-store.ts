/**
 * Crash-safe drafts.
 *
 * Saving reserialises the whole document — 1.4 s on a 41 MB scan — so it cannot run
 * every few seconds. Annotations on their own are small and the engine can round-trip
 * them (`exportAnnotations` / `importAnnotations`), so a draft holds just those.
 *
 * A draft is written after every edit and removed once a save puts the annotations in
 * the file. Anything left behind therefore means the app stopped before saving, which
 * is exactly the case worth recovering.
 */
import type { AnnotationTransferItem } from '@embedpdf/plugin-annotation';

import { readStoredObject, storageKey } from './local-storage';

export type Draft = {
  path: string;
  savedAt: number;
  items: AnnotationTransferItem[];
  /** Items dropped because their binary payload could not be stored. */
  droppedItems: number;
};

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

const BINARY_MARKER = '__irohaArrayBuffer__';

/**
 * Stamp annotations carry an ArrayBuffer in `ctx`, which `JSON.stringify` silently
 * turns into `{}`. Encoding it keeps a future stamp tool from losing data quietly.
 */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof ArrayBuffer) {
    return { [BINARY_MARKER]: bytesToBase64(value) };
  }
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    BINARY_MARKER in (value as Record<string, unknown>)
  ) {
    return base64ToBytes((value as Record<string, string>)[BINARY_MARKER]!);
  }
  return value;
}

/** ImageData cannot be reconstructed faithfully from JSON, so those items are dropped. */
function isStorable(item: AnnotationTransferItem): boolean {
  const ctx = item.ctx as { imageData?: unknown } | undefined;
  return !ctx || ctx.imageData === undefined;
}

/**
 * Writes the draft, and says whether it actually reached storage.
 *
 * A full or disabled storage is not something to shrug off here: the draft is the
 * only copy of an edit that survives a crash, so nobody but the caller can tell the
 * user that the safety net is gone. Returning false is how they find out.
 */
export function saveDraft(path: string, items: AnnotationTransferItem[]): boolean {
  const storable = items.filter(isStorable);
  const draft: Draft = {
    path,
    savedAt: Date.now(),
    items: storable,
    droppedItems: items.length - storable.length,
  };
  try {
    localStorage.setItem(storageKey('draft', path), JSON.stringify(draft, replacer));
    return true;
  } catch (error) {
    // Quota exceeded or storage disabled. The in-memory document is unaffected, but
    // from here on only an explicit Save keeps the work.
    console.warn('Iroha PDF: the autosave draft could not be stored', error);
    return false;
  }
}

export function loadDraft(path: string): Draft | null {
  const draft = readStoredObject<Draft>(storageKey('draft', path), reviver);
  if (!draft || !Array.isArray(draft.items) || typeof draft.savedAt !== 'number') return null;
  return {
    path,
    savedAt: draft.savedAt,
    items: draft.items,
    droppedItems: draft.droppedItems ?? 0,
  };
}

export function clearDraft(path: string): void {
  try {
    localStorage.removeItem(storageKey('draft', path));
  } catch {
    // Nothing to do; a stale draft only costs one recovery prompt.
  }
}
