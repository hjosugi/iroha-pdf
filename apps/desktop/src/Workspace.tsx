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
import { Scroller, useScroll } from '@embedpdf/plugin-scroll/react';
import { SelectionLayer } from '@embedpdf/plugin-selection/react';
import { TilingLayer } from '@embedpdf/plugin-tiling/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import type { Note } from '@iroha-pdf/core';

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
  const { state: scrollState } = useScroll(documentId);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [printMode, setPrintMode] = useState<'all' | 'current' | 'custom'>('all');
  const [pageRange, setPageRange] = useState('');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);

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
      <button className="primary-button" onClick={() => setPrintOpen(true)}>
        Print
      </button>
      {printOpen ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setPrintOpen(false)}>
          <section
            className="print-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="print-dialog-title">Print PDF</h2>
            <fieldset>
              <legend>Pages</legend>
              <label><input type="radio" checked={printMode === 'all'} onChange={() => setPrintMode('all')} /> All pages</label>
              <label><input type="radio" checked={printMode === 'current'} onChange={() => setPrintMode('current')} /> Current page ({scrollState.currentPage || 1})</label>
              <label><input type="radio" checked={printMode === 'custom'} onChange={() => setPrintMode('custom')} /> Range</label>
              <input aria-label="Page range" disabled={printMode !== 'custom'} value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder="1,3,5-7" />
            </fieldset>
            <label className="print-checkbox">
              <input type="checkbox" checked={includeAnnotations} onChange={(event) => setIncludeAnnotations(event.target.checked)} />
              Include annotations
            </label>
            <div className="dialog-actions">
              <button className="tool" onClick={() => setPrintOpen(false)}>Cancel</button>
              <button
                className="primary-button"
                disabled={printMode === 'custom' && !pageRange.trim()}
                onClick={() => {
                  const selectedRange = printMode === 'current'
                    ? String(scrollState.currentPage || 1)
                    : printMode === 'custom' ? pageRange.trim() : undefined;
                  printProvider?.print({ includeAnnotations, pageRange: selectedRange });
                  setPrintOpen(false);
                }}
              >
                Open print preview
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function NotesPanel({ documentId }: { documentId: string }) {
  const storageKey = `iroha-pdf:note:${documentId}`;
  const [note, setNote] = useState<Note>(() => loadLinkedNote(storageKey, documentId));

  useEffect(() => {
    setNote(loadLinkedNote(storageKey, documentId));
  }, [documentId, storageKey]);

  useEffect(() => {
    if (note.linkedDocumentId !== documentId) return;
    const save = () => localStorage.setItem(storageKey, JSON.stringify(note));
    const timer = window.setTimeout(save, 250);
    return () => {
      window.clearTimeout(timer);
      save();
    };
  }, [documentId, note, storageKey]);

  return (
    <aside className="notes-panel">
      <div className="notes-heading">
        <span>Linked note</span>
        <span className="saved-indicator">Autosaved</span>
      </div>
      <textarea
        value={note.body}
        onChange={(event) => setNote((current) => ({
          ...current,
          body: event.target.value,
          updatedAt: new Date().toISOString(),
        }))}
        placeholder="Write a memo for this PDF…"
        aria-label="Linked note"
      />
    </aside>
  );
}

function loadLinkedNote(storageKey: string, documentId: string): Note {
  const stored = localStorage.getItem(storageKey);
  const now = new Date().toISOString();
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<Note>;
      if (typeof parsed.body === 'string') {
        return {
          id: parsed.id ?? `desktop-note:${documentId}`,
          title: parsed.title ?? 'Linked note',
          body: parsed.body,
          linkedDocumentId: documentId,
          createdAt: parsed.createdAt ?? now,
          updatedAt: parsed.updatedAt ?? now,
        };
      }
    } catch {
      // Older versions stored only the body, so keep that local data intact.
      return {
        id: `desktop-note:${documentId}`,
        title: 'Linked note',
        body: stored,
        linkedDocumentId: documentId,
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  return {
    id: `desktop-note:${documentId}`,
    title: 'Linked note',
    body: '',
    linkedDocumentId: documentId,
    createdAt: now,
    updatedAt: now,
  };
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
