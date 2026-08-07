/**
 * How a document's path produces the names a save works with.
 *
 * Kept apart from `file-bridge.ts` because these are the one thing about that module
 * a test can check without a filesystem, and `file-bridge.ts` reaches for the Tauri
 * plugins at import time — which no Node process has. The e2e suite used to carry its
 * own copy of these three rules for exactly that reason, so a rename in the app would
 * not have failed a test; it would have moved both the app and the assertions onto a
 * different file, together and silently.
 */

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
 *
 * `PART_SUFFIX` in `src-tauri/src/lib.rs` spells the same ending out again, on purpose:
 * that is the one path the app may delete, and what it deletes must not be something
 * the webview can name. The real-runtime suite fails if the two ever disagree.
 */
export function partPathFor(path: string): string {
  return path.replace(/\.pdf$/i, '') + '.iroha-part.pdf';
}
