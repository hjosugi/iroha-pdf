import { useEffect } from 'react';
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
import { Scroller } from '@embedpdf/plugin-scroll/react';
import { SelectionLayer } from '@embedpdf/plugin-selection/react';
import { TilingLayer } from '@embedpdf/plugin-tiling/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';

import { BrandMark } from './BrandMark';
import { PdfToolbar } from './PdfToolbar';
import { SidePanel } from './SidePanel';
import { confirmDiscard } from './file-bridge';
import { forgetDocument, getDocumentFile, hasUnsavedEdits } from './document-store';
import {
  useDeleteSelected,
  useDocumentFile,
  useEditTimeline,
  useOpenPdf,
  useRecoverDraft,
} from './use-pdf-file';
import { t, timeFormat } from './i18n';

type WorkspaceProps = {
  activeDocumentId: string | null;
  documentStates: DocumentState[];
};

type TabStripProps = {
  documents: DocumentState[];
  activeDocumentId: string | null;
};

function TabStrip({ documents, activeDocumentId }: TabStripProps) {
  const { provides } = useDocumentManagerCapability();
  const openPdf = useOpenPdf();

  const closeTab = async (documentId: string) => {
    const pending = getDocumentFile(documentId).pendingEdits;
    if (pending > 0) {
      const discard = await confirmDiscard(
        t(pending === 1 ? 'document.unsavedCloseOne' : 'document.unsavedClose', { count: pending }),
      );
      if (!discard) return;
    }
    provides?.closeDocument(documentId);
    forgetDocument(documentId);
  };

  return (
    <div className="tab-strip" role="tablist" aria-label={t('document.openFiles')}>
      {documents.map((document) => (
        <div
          className={document.id === activeDocumentId ? 'tab active' : 'tab'}
          key={document.id}
          role="none"
        >
          <button
            className="tab-label"
            onClick={() => provides?.setActiveDocument(document.id)}
            role="tab"
            aria-selected={document.id === activeDocumentId}
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
    </div>
  );
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
