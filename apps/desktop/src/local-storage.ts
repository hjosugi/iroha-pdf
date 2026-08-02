/**
 * How this app reads `localStorage`.
 *
 * Four things are kept there — a file's history, a crash draft, the tool
 * settings, and a document's note — and none of them may take the workspace
 * down when the browser will not co-operate. Storage can be disabled, full, or
 * still holding whatever an older version wrote, so a read that cannot produce
 * an object reads as "nothing stored" and every caller supplies its own
 * defaults. Writes are not shared: what a refused write means differs per
 * caller, and only the draft has to tell the user about it.
 */

/** The namespaces of the single `iroha-pdf:` key space, kept visible together. */
type Namespace = 'history' | 'draft' | 'tool' | 'note';

export function storageKey(namespace: Namespace, id: string): string {
  return `iroha-pdf:${namespace}:${id}`;
}

/** The stored object, or null when there is nothing usable under the key. */
export function readStoredObject<T>(
  key: string,
  reviver?: (key: string, value: unknown) => unknown,
): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw, reviver);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as Partial<T>;
  } catch {
    return null;
  }
}
