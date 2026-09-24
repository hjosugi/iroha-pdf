import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from 'react';
import type { DocumentState } from '@embedpdf/core';
import { AnnotationLayer } from '@embedpdf/plugin-annotation/react';
import {
  DocumentContent,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react';
import {
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import { Rotate } from '@embedpdf/plugin-rotate/react';
import { Scroller, useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/react';
import { SelectionLayer } from '@embedpdf/plugin-selection/react';
import { TilingLayer } from '@embedpdf/plugin-tiling/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';

import { BrandMark } from './BrandMark';
import { PdfToolbar } from './PdfToolbar';
import { SidePanel } from './SidePanel';
import { confirmDiscard } from './file-bridge';
import { forgetDocument, getDocumentFile, hasUnsavedEdits, isRegistered } from './document-store';
import {
  useDeleteSelected,
  useDocumentFile,
  useEditTimeline,
  useOpenPath,
  useOpenPdf,
  useRecoverDraft,
} from './use-pdf-file';
import { ClosedTabs, lastPageFor, movedIndex, recordLastPage } from './tab-session';
import { t, timeFormat } from './i18n';

type WorkspaceProps = {
  activeDocumentId: string | null;
  documentStates: DocumentState[];
};

type TabStripProps = {
  documents: DocumentState[];
  activeDocumentId: string | null;
};

/** Tabs closed in this window, for Reopen closed tab. One per window, like the tabs. */
const closedTabs = new ClosedTabs();

/** Pointer travel, in CSS pixels, before a press on a tab becomes a drag. */
const TAB_DRAG_THRESHOLD_PX = 6;

function focusTab(documentId: string): void {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLButtonElement>(`[data-document-id="${CSS.escape(documentId)}"] .tab-label`)?.focus();
  });
}

function TabStrip({ documents, activeDocumentId }: TabStripProps) {
  const { provides } = useDocumentManagerCapability();
  const openPdf = useOpenPdf();
  const openPath = useOpenPath();
  const closedCount = useSyncExternalStore(
    useCallback((listener: () => void) => closedTabs.subscribe(listener), []),
    () => closedTabs.count(),
  );
  const [reopenFailed, setReopenFailed] = useState<string | null>(null);
  const drag = useRef<{ id: string; pointerId: number; x: number; moving: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const closeTab = async (documentId: string) => {
    const pending = getDocumentFile(documentId).pendingEdits;
    if (pending > 0) {
      const discard = await confirmDiscard(
        t(pending === 1 ? 'document.unsavedCloseOne' : 'document.unsavedClose', { count: pending }),
      );
      if (!discard) return;
    }
    closedTabs.remember(getDocumentFile(documentId).path);
    provides?.closeDocument(documentId);
    forgetDocument(documentId);
  };

  /**
   * The most recently closed file, opened again — or, if it is already open in
   * another tab, that tab. A file that has since been moved or deleted cannot be
   * reopened, and the strip says so rather than doing nothing.
   */
  const reopenClosed = useCallback(async () => {
    const path = closedTabs.takeLast();
    if (!path) return;
    setReopenFailed(null);
    const open = documents.find((document) => getDocumentFile(document.id).path === path);
    if (open) {
      provides?.setActiveDocument(open.id);
      return;
    }
    try {
      await openPath(path);
    } catch (error) {
      console.error('Iroha PDF: a closed tab could not be reopened', error);
      setReopenFailed(t('tabs.reopenFailed', { name: path.split(/[\\/]/).pop() ?? path }));
    }
  }, [documents, openPath, provides]);

  // Ctrl/⌘+Shift+T, as in every browser.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== 't') return;
      event.preventDefault();
      void reopenClosed();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [reopenClosed]);

  const move = (documentId: string, to: number) => {
    provides?.moveDocument(documentId, to);
    focusTab(documentId);
  };

  /** Ctrl+Shift+Page Up / Page Down moves the focused tab, as browsers do. */
  const onTabKeyDown = (event: ReactKeyboardEvent, documentId: string) => {
    if (!event.ctrlKey || !event.shiftKey) return;
    const delta = event.key === 'PageUp' ? -1 : event.key === 'PageDown' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const to = movedIndex(documents.map((document) => document.id), documentId, delta);
    if (to !== null) move(documentId, to);
  };

  /** The tab under the pointer, as the index a dragged tab should take. */
  const indexAt = (x: number, y: number): number | null => {
    const tab = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-document-id]');
    if (!tab) return null;
    const index = documents.findIndex((document) => document.id === tab.dataset.documentId);
    return index < 0 ? null : index;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moving) {
      if (Math.abs(event.clientX - current.x) < TAB_DRAG_THRESHOLD_PX) return;
      current.moving = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDropIndex(indexAt(event.clientX, event.clientY));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDropIndex(null);
    if (!current.moving) return;
    suppressClick.current = true;
    const to = commit ? indexAt(event.clientX, event.clientY) : null;
    if (to !== null && documents[to]?.id !== current.id) move(current.id, to);
  };

  return (
    <div
      className="tab-strip"
      role="tablist"
      aria-label={t('document.openFiles')}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, true)}
      onPointerCancel={(event) => endDrag(event, false)}
    >
      {documents.map((document, index) => (
        <div
          className={[
            document.id === activeDocumentId ? 'tab active' : 'tab',
            dropIndex === index && drag.current?.id !== document.id ? 'drop-target' : '',
          ].join(' ').trim()}
          key={document.id}
          role="none"
          data-document-id={document.id}
        >
          <button
            className="tab-label"
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              provides?.setActiveDocument(document.id);
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              drag.current = { id: document.id, pointerId: event.pointerId, x: event.clientX, moving: false };
            }}
            onKeyDown={(event) => onTabKeyDown(event, document.id)}
            role="tab"
            aria-selected={document.id === activeDocumentId}
            aria-keyshortcuts="Control+Shift+PageUp Control+Shift+PageDown"
            title={document.name ?? t('document.untitled')}
          >
            <span>{document.name ?? t('document.untitled')}</span>
          </button>
          <button
            className="tab-close"
            onClick={() => void closeTab(document.id)}
            aria-label={`${t('document.closeTab')}: ${document.name ?? t('document.untitled')}`}
            title={t('document.closeTab')}
          >
            ×
          </button>
        </div>
      ))}
      {documents.length > 0 ? (
        <button className="icon-button" onClick={() => void openPdf()} aria-label={t('document.openAnother')} title={t('document.openAnother')}>
          +
        </button>
      ) : null}
      {closedCount > 0 ? (
        <button
          className="icon-button"
          onClick={() => void reopenClosed()}
          aria-label={t('tabs.reopen')}
          aria-keyshortcuts="Control+Shift+T Meta+Shift+T"
          title={t('tabs.reopen')}
        >
          ↺
        </button>
      ) : null}
      {reopenFailed ? <span className="tab-error" role="alert">{reopenFailed}</span> : null}
    </div>
  );
}

/**
 * Where each file was being read (#13). The first time a document's pages are
 * laid out, it moves to the page that file was last read at; from then on, the
 * page being read is remembered.
 *
 * Two orderings have to be waited out. The path is registered a moment after
 * the engine has the document, and the layout is ready only once the viewport
 * has been measured — a scroll requested before that is lost. And recording
 * waits until the move has landed, or the page one a document opens at would
 * overwrite the page it is about to go back to.
 */
const layoutReady = new Set<string>();
const layoutListeners = new Set<() => void>();

function useLayoutReadyTracking(): void {
  const { provides: scroll } = useScrollCapability();
  useEffect(() => {
    if (!scroll) return;
    return scroll.onLayoutReady((event) => {
      if (layoutReady.has(event.documentId)) return;
      layoutReady.add(event.documentId);
      for (const listener of layoutListeners) listener();
    });
  }, [scroll]);
}

function useIsLayoutReady(documentId: string): boolean {
  return useSyncExternalStore(
    useCallback((listener: () => void) => {
      layoutListeners.add(listener);
      return () => layoutListeners.delete(listener);
    }, []),
    () => layoutReady.has(documentId),
  );
}

/** How long a requested move may take to land before the reader's page is recorded anyway. */
const POSITION_SETTLE_MS = 2000;

const positioned = new Map<string, { target: number | null; settled: boolean }>();

function useReadingPosition(documentId: string): void {
  const file = useDocumentFile(documentId);
  const { provides: scroll, state } = useScroll(documentId);
  const ready = useIsLayoutReady(documentId);
  const registered = isRegistered(documentId);

  useEffect(() => {
    if (!scroll || !ready || !registered || positioned.has(documentId)) return;
    const page = lastPageFor(file.path);
    const target = page !== null && page <= state.totalPages ? page : null;
    positioned.set(documentId, { target, settled: target === null });
    if (target === null) return;
    scroll.scrollToPage({ pageNumber: target, behavior: 'instant' });
    // Not cleared on re-render: it only marks the entry, and a move that never
    // lands must not leave this document's position unrecorded for good.
    window.setTimeout(() => {
      const entry = positioned.get(documentId);
      if (entry) entry.settled = true;
    }, POSITION_SETTLE_MS);
  }, [documentId, file.path, ready, registered, scroll, state.totalPages]);

  useEffect(() => {
    const entry = positioned.get(documentId);
    if (!entry || state.currentPage < 1) return;
    if (!entry.settled) {
      if (state.currentPage !== entry.target) return;
      entry.settled = true;
    }
    recordLastPage(file.path, state.currentPage);
  }, [documentId, file.path, state.currentPage]);
}

function EmptyWorkspace() {
  const openPdf = useOpenPdf();

  return (
    <section className="empty-workspace">
      <BrandMark className="empty-mark" />
      <h1>{t('app.tagline')}</h1>
      <p>{t('app.emptyHelp')}</p>
      <button className="primary-button large" onClick={() => void openPdf()}>{t('document.open')}</button>
    </section>
  );
}

/**
 * Offered when a draft outlived the app that wrote it, which means edits never made it
 * into the file. Nothing is applied until the user says so: silently mutating a
 * document someone just opened would be its own kind of data loss.
 */
function RecoveryBanner({ documentId }: { documentId: string }) {
  const file = useDocumentFile(documentId);
  const { restore, discard } = useRecoverDraft(documentId);

  if (!file.recovery) return null;
  const count = file.recovery.items.length;

  return (
    <div className="recovery-banner" role="status">
      <span>
        <strong>{t('recovery.found')}</strong>{' '}
        {t(count === 1 ? 'recovery.desktopDetailOne' : 'recovery.desktopDetail', {
          count,
          time: timeFormat.format(file.recovery.savedAt),
        })}
      </span>
      <span className="recovery-actions">
        <button className="tool" onClick={discard}>
          {t('recovery.discard')}
        </button>
        <button className="primary-button" onClick={restore}>
          {t('recovery.restore')}
        </button>
      </span>
    </div>
  );
}

/**
 * Autosave failing quietly is worse than autosave failing loudly: the whole point of
 * drafting every edit is that nobody has to think about a crash, so someone who is
 * never told it stopped will keep working and lose all of it. Saying so is the only
 * thing that turns this back into a decision they can make.
 */
function AutosaveBanner({ documentId }: { documentId: string }) {
  const file = useDocumentFile(documentId);

  if (file.draftFailedAt === null) return null;

  return (
    <div className="autosave-banner" role="alert">
      <span>
        <strong>{t('autosave.stopped')}</strong>{' '}
        {t('autosave.stoppedBody', { time: timeFormat.format(file.draftFailedAt) })}
      </span>
    </div>
  );
}

function ActiveDocument({ documentId, documentName }: { documentId: string; documentName: string }) {
  useEditTimeline(documentId);
  useReadingPosition(documentId);
  useDeleteSelected(documentId);
  return (
    <>
      <PdfToolbar documentId={documentId} documentName={documentName} />
      <AutosaveBanner documentId={documentId} />
      <RecoveryBanner documentId={documentId} />
    </>
  );
}

/** The pages themselves, and the layers that make them selectable and markable. */
function PdfViewer({ documentId }: { documentId: string }) {
  return (
    <DocumentContent documentId={documentId}>
      {({ isLoading, isError, isLoaded }) => (
        <>
          {isLoading && <div className="center-state">{t('document.opening')}</div>}
          {isError && <div className="center-state">{t('document.openFailed')}</div>}
          {isLoaded && (
            <GlobalPointerProvider documentId={documentId}>
              <Viewport documentId={documentId} className="pdf-viewport">
                <Scroller
                  documentId={documentId}
                  renderPage={({ pageIndex }) => (
                    <Rotate documentId={documentId} pageIndex={pageIndex}>
                      <PagePointerProvider documentId={documentId} pageIndex={pageIndex}>
                        <RenderLayer
                          documentId={documentId}
                          pageIndex={pageIndex}
                          scale={1}
                          style={{ pointerEvents: 'none' }}
                          // Which page a picture is, for the e2e that checks a
                          // file reopens at the page it was last read at.
                          data-page-index={pageIndex}
                        />
                        <TilingLayer
                          documentId={documentId}
                          pageIndex={pageIndex}
                          style={{ pointerEvents: 'none' }}
                        />
                        <SelectionLayer documentId={documentId} pageIndex={pageIndex} />
                        <AnnotationLayer documentId={documentId} pageIndex={pageIndex} />
                      </PagePointerProvider>
                    </Rotate>
                  )}
                />
              </Viewport>
            </GlobalPointerProvider>
          )}
        </>
      )}
    </DocumentContent>
  );
}

/**
 * Closing the window is the other way work disappears. beforeunload cannot be async,
 * so this only marks the event; the runtime shows its own confirmation.
 */
function useUnsavedGuard(): void {
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedEdits()) return;
      event.preventDefault();
      // Legacy browsers require a returnValue to show the prompt at all.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
}

export function Workspace({ activeDocumentId, documentStates }: WorkspaceProps) {
  useUnsavedGuard();
  useLayoutReadyTracking();

  const active = documentStates.find((document) => document.id === activeDocumentId);
  const activeName = active?.name ?? 'document.pdf';
  // Editing tools on a document that failed to load offer actions that cannot work:
  // Save on a document the engine never opened only produces an error.
  const canEdit = active?.status === 'loaded';

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><BrandMark className="brand-mark" /> {t('app.name')}</div>
        <div className="header-status"><span className="status-dot" /> {t('app.localFirst')}</div>
      </header>
      <TabStrip activeDocumentId={activeDocumentId} documents={documentStates} />
      {activeDocumentId ? (
        <>
          {canEdit && <ActiveDocument documentId={activeDocumentId} documentName={activeName} />}
          <div className="workspace-body">
            <section className="viewer-pane">
              <PdfViewer documentId={activeDocumentId} />
            </section>
            <SidePanel documentId={activeDocumentId} />
          </div>
        </>
      ) : (
        <EmptyWorkspace />
      )}
    </main>
  );
}
