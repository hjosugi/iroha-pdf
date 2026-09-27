/**
 * Turning whatever a platform or provider threw into something a person can read (#55).
 *
 * The failure this addresses is specific: a raw rejection reaches a user as
 * `Task rejected: {"code":14,"message":"Document doc-123 not found"}`, or
 * `ENOENT: no such file or directory, open '/data/user/0/…'`, and none of it is
 * actionable. The app's own messages are different — they are already written in
 * the user's language and say what happened — so they are passed through, and only
 * text that carries the marks of a platform error is replaced with a category.
 *
 * Core has no locale, so the categories are message *keys*; the caller looks them
 * up. `isTechnicalMessage` is exported so a caller can decide for itself whether a
 * string is safe to show.
 */
import type { MessageKey, Translate } from './i18n';

export type ErrorKind =
  | 'network'
  | 'auth'
  | 'storage-full'
  | 'busy'
  | 'permission'
  | 'not-found'
  | 'corrupt-file'
  | 'unsupported'
  | 'cancelled'
  | 'unknown';

export const ERROR_MESSAGE_KEYS: Record<ErrorKind, MessageKey> = {
  network: 'error.network',
  auth: 'error.auth',
  'storage-full': 'error.storageFull',
  busy: 'error.busy',
  permission: 'error.permission',
  'not-found': 'error.notFound',
  'corrupt-file': 'error.corruptFile',
  unsupported: 'error.unsupported',
  cancelled: 'error.cancelled',
  unknown: 'error.unknown',
};

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

function codeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
  }
  return '';
}

/** The category an unknown rejection belongs to. Order matters: the first match wins. */
export function classifyError(error: unknown): ErrorKind {
  const haystack = `${codeOf(error)} ${messageOf(error)}`;
  if (/SQLITE_FULL|ENOSPC|no space left|disk is full|not enough space|out of space/i.test(haystack)) {
    return 'storage-full';
  }
  if (/SQLITE_BUSY|database is locked|EBUSY|resource busy/i.test(haystack)) return 'busy';
  if (/SQLITE_CORRUPT|not a database|file is encrypted|invalid pdf structure|corrupt|damaged|malformed/i.test(haystack)) {
    return 'corrupt-file';
  }
  if (/EACCES|EPERM|permission denied|forbidden path|not allowed|access is denied|os error 5\b/i.test(haystack)) {
    return 'permission';
  }
  if (/ENOENT|not found|no such file|\b404\b/i.test(haystack)) return 'not-found';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network request failed|failed to fetch|network error|offline|socket hang up/i.test(haystack)) {
    return 'network';
  }
  if (/\b401\b|\b403\b|unauthor|invalid_grant|invalid_token|oauth|sign[- ]?in/i.test(haystack)) return 'auth';
  if (/abort|cancell?ed/i.test(haystack)) return 'cancelled';
  if (/unsupported|not supported|unimplemented/i.test(haystack)) return 'unsupported';
  return 'unknown';
}

/**
 * The marks of a platform or provider error: native codes, SQLite codes, stack
 * frames, URLs, absolute paths and JavaScript type errors. A message carrying one
 * of these is not written for a person to read.
 */
const TECHNICAL_MARKERS: readonly RegExp[] = [
  /\b(?:EACCES|EPERM|ENOENT|ENOSPC|EIO|EBUSY|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EADDRINUSE|EAI_AGAIN)\b/,
  /\bSQLITE_[A-Z_]+\b/,
  /\bat\s+[\w$.<>[\]]+\s*\([^)]*:\d+:\d+\)/,
  /\b(?:https?|file|content|blob|ipc):\/\//,
  /(?:^|\s)\/(?:[\w.-]+\/)+[\w.-]+/,
  /\b[A-Za-z]:\\[\w.\\-]+/,
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|AssertionError|UnhandledPromiseRejection)\b/,
  /\bis not a function\b|\bCannot read propert|\bundefined is not\b/,
  /\bTask rejected\b/,
  /\{\s*"code"\s*:\s*-?\d+/,
];

export function isTechnicalMessage(message: string): boolean {
  return TECHNICAL_MARKERS.some((pattern) => pattern.test(message));
}

/**
 * The text to put in front of a user for `error`.
 *
 * A recognised category is localized. An unrecognised message that does not look
 * technical is the app's own wording and is returned unchanged. Anything else — an
 * unclassified platform error — becomes the generic message rather than leaking.
 */
export function userFacingErrorMessage(error: unknown, translate: Translate): string {
  const kind = classifyError(error);
  if (kind !== 'unknown') return translate(ERROR_MESSAGE_KEYS[kind]);
  const message = messageOf(error);
  if (message && !isTechnicalMessage(message)) return message;
  return translate(ERROR_MESSAGE_KEYS.unknown);
}
