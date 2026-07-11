import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DocumentState } from '@embedpdf/core';
import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import {
  DocumentContent,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react';
import { useExport } from '@embedpdf/plugin-export/react';
import { useHistoryCapability } from '@embedpdf/plugin-history/react';
import {
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react';
import { usePrint } from '@embedpdf/plugin-print/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import { Rotate } from '@embedpdf/plugin-rotate/react';
import { Scroller } from '@embedpdf/plugin-scroll/react';
import { SelectionLayer } from '@embedpdf/plugin-selection/react';
import { TilingLayer } from '@embedpdf/plugin-tiling/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';

type WorkspaceProps = {
  activeDocumentId: string | null;
  documentStates: DocumentState[];
};

type TabStripProps = WorkspaceProps & {
  documents: DocumentState[];
};

const TOOL_LABELS = [
  ['highlight', 'Highlight'],
  ['ink', 'Pen'],
  ['freeText', 'Text'],
  ['square', 'Shape'],
] as const;

function TabStrip({ documents, activeDocumentId }: TabStripProps) {
  const { provides } = useDocumentManagerCapability();

  return (
    <div className="tab-strip" role="tablist" aria-label="Open files">
      {documents.map((document) => (
        <button
          className={document.id === activeDocumentId ? 'tab active' : 'tab'}
          key={document.id}
          onClick={() => provides?.setActiveDocument(document.id)}
          role="tab"
          aria-selected={document.id === activeDocumentId}
        >
          <span>{document.name ?? 'Untitled PDF'}</span>
          <span
            className="tab-close"
            onClick={(event) => {
              event.stopPropagation();
              provides?.closeDocument(document.id);
            }}
            role="button"
            aria-label="Close tab"
            tabIndex={0}
          >
            ×
          </span>
        </button>
      ))}
      <button className="icon-button" onClick={() => provides?.openFileDialog()} title="Open PDF">
        +
      </button>
    </div>
  );
}

function PdfToolbar({ documentId }: { documentId: string }) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: historyCapability } = useHistoryCapability();
  const { provides: exportProvider } = useExport(documentId);
  const { provides: printProvider } = usePrint(documentId);
  const annotation = useMemo(
    () => annotationCapability?.forDocument(documentId),
    [annotationCapability, documentId],
  );
  const history = useMemo(
    () => historyCapability?.forDocument(documentId),
    [historyCapability, documentId],
  );
  const [activeTool, setActiveTool] = useState<string | null>(null);

  useEffect(() => {
    if (!annotation) return;
    setActiveTool(annotation.getActiveTool()?.id ?? null);
    return annotation.onActiveToolChange((tool) => setActiveTool(tool?.id ?? null));
  }, [annotation]);

  const toggleTool = (tool: string) => {
    annotation?.setActiveTool(activeTool === tool ? null : tool);
  };

  return (
    <div className="pdf-toolbar">
      <span className="toolbar-group-label">Edit</span>
      {TOOL_LABELS.map(([tool, label]) => (
        <button
          className={activeTool === tool ? 'tool active' : 'tool'}
          key={tool}
          onClick={() => toggleTool(tool)}
        >
          {label}
        </button>
      ))}
      <span className="toolbar-divider" />
      <button className="tool" onClick={() => history?.undo()}>Undo</button>
      <button className="tool" onClick={() => history?.redo()}>Redo</button>
      <span className="toolbar-spacer" />
      <button className="tool" onClick={() => exportProvider?.download()}>Export</button>
      <button className="primary-button" onClick={() => printProvider?.print({ includeAnnotations: true })}>
        Print
      </button>
    </div>
  );
}

function NotesPanel({ documentId }: { documentId: string }) {
  const storageKey = `iroha-pdf:note:${documentId}`;
  const [body, setBody] = useState(() => localStorage.getItem(storageKey) ?? '');

  useEffect(() => {
    setBody(localStorage.getItem(storageKey) ?? '');
  }, [storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => localStorage.setItem(storageKey, body), 250);
    return () => window.clearTimeout(timer);
  }, [body, storageKey]);

  return (
    <aside className="notes-panel">
      <div className="notes-heading">
        <span>Linked note</span>
        <span className="saved-indicator">Autosaved</span>
      </div>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write a memo for this PDF…"
        aria-label="Linked note"
      />
    </aside>
  );
}

function EmptyWorkspace() {
  const { provides } = useDocumentManagerCapability();
  const open = useCallback(() => provides?.openFileDialog(), [provides]);

  return (
    <section className="empty-workspace">
      <div className="empty-mark">い</div>
      <h1>Your documents, without the clutter.</h1>
      <p>Open a PDF to read, annotate, write linked notes, export, and print locally.</p>
      <button className="primary-button large" onClick={open}>Open PDF</button>
    </section>
  );
}

export function Workspace({ activeDocumentId, documentStates }: WorkspaceProps) {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark">い</span> Iroha PDF</div>
        <div className="header-status"><span className="status-dot" /> Local-first</div>
      </header>
      <TabStrip activeDocumentId={activeDocumentId} documents={documentStates} documentStates={documentStates} />
      {activeDocumentId ? (
        <>
          <PdfToolbar documentId={activeDocumentId} />
          <div className="workspace-body">
            <section className="viewer-pane">
              <DocumentContent documentId={activeDocumentId}>
                {({ isLoading, isError, isLoaded }) => (
                  <>
                    {isLoading && <div className="center-state">Opening PDF…</div>}
                    {isError && <div className="center-state">This PDF could not be opened.</div>}
                    {isLoaded && (
                      <GlobalPointerProvider documentId={activeDocumentId}>
                        <Viewport documentId={activeDocumentId} className="pdf-viewport">
                          <Scroller
                            documentId={activeDocumentId}
                            renderPage={({ pageIndex }) => (
                              <Rotate documentId={activeDocumentId} pageIndex={pageIndex}>
                                <PagePointerProvider documentId={activeDocumentId} pageIndex={pageIndex}>
                                  <RenderLayer
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                    scale={1}
                                    style={{ pointerEvents: 'none' }}
                                  />
                                  <TilingLayer
                                    documentId={activeDocumentId}
                                    pageIndex={pageIndex}
                                    style={{ pointerEvents: 'none' }}
                                  />
                                  <SelectionLayer documentId={activeDocumentId} pageIndex={pageIndex} />
                                  <AnnotationLayer documentId={activeDocumentId} pageIndex={pageIndex} />
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
            </section>
            <NotesPanel documentId={activeDocumentId} />
          </div>
        </>
      ) : (
        <EmptyWorkspace />
      )}
    </main>
  );
}
