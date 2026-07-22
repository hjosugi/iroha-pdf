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

export type Draft = {
  path: string;
  savedAt: number;
  items: AnnotationTransferItem[];
  /** Items dropped because their binary payload could not be stored. */
  droppedItems: number;
};

function draftKey(path: string): string {
  return `iroha-pdf:draft:${path}`;
}

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

export function saveDraft(path: string, items: AnnotationTransferItem[]): void {
  const storable = items.filter(isStorable);
  const draft: Draft = {
    path,
    savedAt: Date.now(),
    items: storable,
    droppedItems: items.length - storable.length,
  };
  try {
    localStorage.setItem(draftKey(path), JSON.stringify(draft, replacer));
  } catch {
    // Quota exceeded or storage disabled. The in-memory document is unaffected, and
    // the user still has the explicit Save button.
  }
}

export function loadDraft(path: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(path));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw, reviver);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const draft = parsed as Partial<Draft>;
    if (!Array.isArray(draft.items) || typeof draft.savedAt !== 'number') return null;
    return {
      path,
      savedAt: draft.savedAt,
      items: draft.items,
      droppedItems: draft.droppedItems ?? 0,
    };
  } catch {
    return null;
  }
}

export function clearDraft(path: string): void {
  try {
    localStorage.removeItem(draftKey(path));
  } catch {
    // Nothing to do; a stale draft only costs one recovery prompt.
  }
}

export function hasDraft(path: string): boolean {
  return loadDraft(path) !== null;
}
