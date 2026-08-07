/**
 * The page strip.
 *
 * Every page has a slot from the start, so the list is the right length and scrolls
 * correctly before anything has been drawn; the picture arrives into its slot when the
 * page comes near the viewport. An IntersectionObserver decides "near", which is what
 * keeps a 500-page document from asking for 500 renders — the requirement this panel
 * exists to satisfy, and the one the strip would fail by simply mapping over the pages.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';
import { useRenderCapability } from '@embedpdf/plugin-render/react';

import { t } from './i18n';
import { ThumbnailStore } from './thumbnails';

/**
 * Rendered width. Small enough to be cheap, large enough to recognise a page by, and
 * the same number as the `--thumbnail-width` token the strip lays out with. They drift
 * harmlessly — `object-fit` rescales whatever arrives — but a thumbnail is sharpest
 * when the bitmap is the size it will be shown at.
 */
const THUMBNAIL_WIDTH = 120;

/**
 * How far outside the viewport a page is still worth having: one screenful, so an
 * ordinary scroll lands on pictures rather than on a column of placeholders.
 */
const PREFETCH_MARGIN = '100% 0px';

type Document = { pageCount: number; firstPageWidth: number };

/** The open document, once the engine has it. Null while it is still loading. */
function useDocument(documentId: string): Document | null {
  const { provides } = useDocumentManagerCapability();
  const [document, setDocument] = useState<Document | null>(null);

  useEffect(() => {
    if (!provides) return;
    let cancelled = false;
    const read = () => {
      const open = provides.getDocument(documentId);
      if (cancelled || !open || open.pageCount === 0) return false;
      setDocument({
        pageCount: open.pageCount,
        firstPageWidth: open.pages[0]?.size.width ?? 612,
      });
      return true;
    };
    if (read()) return;
    // The panel can be opened while the document is still being parsed; there is no
    // event on this capability to wait for, so look again until it is there.
    const timer = window.setInterval(() => {
      if (read()) window.clearInterval(timer);
    }, 200);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [provides, documentId]);

  return document;
}

function useThumbnailStore(documentId: string, document: Document | null): ThumbnailStore | null {
  const { provides: render } = useRenderCapability();

  const store = useMemo(() => {
    if (!render || !document) return null;
    const scope = render.forDocument(documentId);
    // From the page's own width rather than an assumed one: a slide deck and an A4
    // report do not want the same scale to come out the same size on screen.
    const scaleFactor = THUMBNAIL_WIDTH / document.firstPageWidth;
    return new ThumbnailStore((pageIndex) =>
      scope.renderPage({ pageIndex, options: { scaleFactor } }).toPromise(),
    );
  }, [render, documentId, document]);

  // Closing the panel, or opening another document, has to release the bitmaps: they
  // are held by object URLs, which outlive React state.
  useEffect(() => () => store?.dispose(), [store]);

  return store;
}

function Thumbnail({ store, pageIndex }: { store: ThumbnailStore; pageIndex: number }) {
  const ref = useRef<HTMLLIElement>(null);

  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const url = useSyncExternalStore(
    subscribe,
    () => store.get(pageIndex),
    () => undefined,
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) store.request(pageIndex);
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [store, pageIndex]);

  return (
    <li className="thumbnail" ref={ref} data-page={pageIndex + 1}>
      {url ? (
        <img
          className="thumbnail-image"
          src={url}
          alt={t('thumbnails.page', { page: pageIndex + 1 })}
        />
      ) : (
        // Reserves the space the picture will take, so arriving thumbnails do not
        // shove the rest of the strip down the page under the reader.
        <span className="thumbnail-placeholder" aria-hidden="true" />
      )}
      <span className="thumbnail-number">{pageIndex + 1}</span>
    </li>
  );
}

export function PageThumbnails({ documentId }: { documentId: string }) {
  const document = useDocument(documentId);
  const store = useThumbnailStore(documentId, document);

  if (!document || !store) {
    return <p className="history-empty">{t('thumbnails.empty')}</p>;
  }

  return (
    <ol className="thumbnail-strip" aria-label={t('thumbnails.label')}>
      {Array.from({ length: document.pageCount }, (_, pageIndex) => (
        <Thumbnail key={pageIndex} store={store} pageIndex={pageIndex} />
      ))}
    </ol>
  );
}
