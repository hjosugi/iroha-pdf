/**
 * What a PDF link is allowed to open (#57).
 *
 * A PDF is untrusted input, and a link annotation is a URL the document chose. Only
 * the schemes a person expects from a document are accepted: web, mail and phone.
 * `javascript:`, `file:`, custom handlers and anything else are refused before a
 * confirmation is even shown, so there is no dialog that can be clicked through into
 * running something.
 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function externalUrlOrNull(raw: string): string | null {
  try {
    const url = new URL(raw);
    return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
