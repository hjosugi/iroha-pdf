import type { PdfDocumentObject, PdfEngine } from '@embedpdf/models';

/**
 * Whole-page text extraction for search (#45).
 *
 * The selection plugin can give the text under a selection; search needs every
 * page. Extraction is per page so one unreadable page does not lose the rest, and
 * the result is cached per open document — reopening the same bytes is the same
 * text, and a search box should not re-extract 500 pages on every keystroke.
 */
const CACHE_LIMIT = 8;
const cache = new Map<string, string[]>();

export async function extractDocumentText(
  documentId: string,
  engine: PdfEngine,
  document: PdfDocumentObject,
): Promise<string[]> {
  const cached = cache.get(documentId);
  if (cached) return cached;

  const texts = await Promise.all(
    document.pages.map((_page, index) => engine.extractText(document, [index]).toPromise()),
  );

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(documentId, texts);
  return texts;
}

/** Test seam: the cache must not outlive a test that reuses a document id. */
export function clearTextCache(): void {
  cache.clear();
}
