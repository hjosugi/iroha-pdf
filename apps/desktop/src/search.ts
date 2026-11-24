/**
 * Finding a query in extracted page text (#45).
 *
 * Kept as a pure function over strings so the matching and snippet rules can be
 * tested without a PDF engine. The engine's extraction is the part that needs a
 * document; this is the part that decides what a "result" is.
 *
 * Matching is case-insensitive substring matching rather than word tokenisation.
 * That is deliberate for the first version: the app ships Japanese and English,
 * Japanese has no spaces to tokenise on, and a substring search gives a correct
 * answer for both. It does not stem or rank; those belong to a real index.
 */
export type SearchHit = {
  pageIndex: number;
  /** A single-line excerpt around the match. */
  snippet: string;
  /** Character offset of the match within the page's text. */
  offset: number;
};

export type SearchOptions = {
  /** Total hits returned across all pages. Defaults to 50. */
  limit?: number;
  /** Characters of context on each side of the match. Defaults to 40. */
  context?: number;
};

function snippetAround(
  text: string,
  start: number,
  length: number,
  context: number,
): string {
  const from = Math.max(0, start - context);
  const to = Math.min(text.length, start + length + context);
  const excerpt = text
    .slice(from, to)
    .replace(/\s+/g, ' ')
    .trim();
  return `${from > 0 ? '…' : ''}${excerpt}${to < text.length ? '…' : ''}`;
}

export function findInPages(
  pages: readonly string[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const needle = query.trim();
  if (needle.length === 0) return [];

  const limit = options.limit ?? 50;
  const context = options.context ?? 40;
  const lowerNeedle = needle.toLocaleLowerCase();
  const hits: SearchHit[] = [];

  for (const [pageIndex, page] of pages.entries()) {
    const lowerPage = page.toLocaleLowerCase();
    let from = 0;
    while (hits.length < limit) {
      const at = lowerPage.indexOf(lowerNeedle, from);
      if (at < 0) break;
      hits.push({
        pageIndex,
        offset: at,
        snippet: snippetAround(page, at, needle.length, context),
      });
      from = at + needle.length;
    }
    if (hits.length >= limit) break;
  }

  return hits;
}
