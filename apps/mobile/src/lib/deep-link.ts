/**
 * The one check an incoming `iroha-pdf://` link passes before the router reads it.
 *
 * Expo Router hands a link's query to `query-string`, which decodes it with
 * `decode-uri-component@0.2`. When `decodeURIComponent` refuses its input, that
 * package falls back to retrying every split of the percent-escapes it can find,
 * and the cost of that grows so fast that a link a few kilobytes long holds the
 * JavaScript thread for as long as the attacker likes (GHSA-vcc3-ghjq-m6fr). The
 * fixed release, 0.5.0, is ESM-only, and `query-string@7` — the version Expo
 * Router pins — `require`s it, so the fix cannot be installed underneath it.
 *
 * The slow path is only ever reached from a string that `decodeURIComponent`
 * rejects. A link that decodes as a whole also decodes piece by piece, because
 * the pieces are cut at ASCII separators and an ASCII byte cannot sit inside a
 * valid multi-byte escape. So refusing a link that does not decode as a whole is
 * enough to keep every link off the slow path, and it costs one linear pass.
 *
 * The application defines no links of its own — nothing it does is reachable only
 * through one — so a refused link loses nothing by opening the library instead.
 * The length bound is a second fence: nothing this application routes to has a
 * path anywhere near it.
 */
export const MAX_SYSTEM_PATH_LENGTH = 2048;

/** Where a refused link lands: the library, which every launch can show. */
export const REFUSED_SYSTEM_PATH = '/';

export function safeSystemPath(path: string): string {
  if (path.length > MAX_SYSTEM_PATH_LENGTH) return REFUSED_SYSTEM_PATH;
  try {
    decodeURIComponent(path);
  } catch {
    return REFUSED_SYSTEM_PATH;
  }
  return path;
}
