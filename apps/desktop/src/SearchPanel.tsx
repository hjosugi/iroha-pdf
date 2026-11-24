import { useEffect, useState } from 'react';
import { useCoreState } from '@embedpdf/core/react';
import { useScrollCapability } from '@embedpdf/plugin-scroll/react';

import { extractDocumentText } from './document-search';
import { usePdfEngine } from './engine-context';
import { t } from './i18n';
import { loadLinkedNote } from './note-store';
import { findInPages, type SearchHit } from './search';

/**
 * Search across the open document and its linked note (#45).
 *
 * The engine's text extraction is the expensive part, so a query is debounced and
 * the extraction is cached per document. Matching is substring-based — see
 * `./search` for why that is the right first version for both languages.
 */
export function SearchPanel({
  documentId,
  noteKey,
  documentName,
}: {
  documentId: string;
  noteKey: string;
  documentName: string;
}) {
  const engine = usePdfEngine();
  const core = useCoreState();
  const document = core?.documents[documentId]?.document ?? null;
  const { provides: scroll } = useScrollCapability();

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [noteHits, setNoteHits] = useState<SearchHit[] | null>(null);
  const [noteBody, setNoteBody] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setNoteBody(null);
    void loadLinkedNote(noteKey).then(
      (note) => {
        if (!cancelled) setNoteBody(note.body);
      },
      (error: unknown) => {
        console.warn('Iroha PDF: the note could not be read for search', error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [noteKey]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!engine || !document || trimmed.length === 0) {
      setHits(null);
      setNoteHits(null);
      setBusy(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setBusy(true);
    setFailed(false);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const pages = await extractDocumentText(documentId, engine, document);
          if (cancelled) return;
          setHits(findInPages(pages, trimmed));
          setNoteHits(noteBody === null ? null : findInPages([noteBody], trimmed));
        } catch (error) {
          console.warn('Iroha PDF: the document text could not be read', error);
          if (!cancelled) setFailed(true);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [document, documentId, engine, noteBody, query]);

  const jump = (pageIndex: number) => {
    scroll?.forDocument(documentId).scrollToPage({
      pageNumber: pageIndex + 1,
      behavior: 'smooth',
      alignY: 20,
    });
  };

  const nothing =
    !busy && !failed && hits !== null && hits.length === 0 && (noteHits?.length ?? 0) === 0;

  return (
    <div className="search-panel">
      <p className="side-panel-path" title={documentName}>
        {documentName}
      </p>
      <input
        className="search-input"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
      />

      {busy && (
        <span className="saved-indicator" role="status">
          {t('search.searching')}
        </span>
      )}
      {failed && (
        <span className="saved-indicator failed" role="alert">
          {t('search.failed')}
        </span>
      )}

      {hits && hits.length > 0 && (
        <section className="search-section">
          <h3 className="search-heading">{t('search.document')}</h3>
          <ol className="search-results">
            {hits.map((hit, index) => (
              <li key={`${hit.pageIndex}-${hit.offset}-${index}`}>
                <button className="tool search-hit" onClick={() => jump(hit.pageIndex)}>
                  <span className="search-page">
                    {t('search.page', { page: hit.pageIndex + 1 })}
                  </span>
                  <span className="search-snippet">{hit.snippet}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {noteHits && noteHits.length > 0 && (
        <section className="search-section">
          <h3 className="search-heading">{t('search.note')}</h3>
          <ul className="search-results">
            {noteHits.map((hit, index) => (
              <li key={`note-${hit.offset}-${index}`} className="search-note-hit">
                {hit.snippet}
              </li>
            ))}
          </ul>
        </section>
      )}

      {nothing && <p className="history-empty">{t('search.noResults')}</p>}
    </div>
  );
}
