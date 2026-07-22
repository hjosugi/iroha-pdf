import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DocumentState } from '@embedpdf/core';
import { AnnotationLayer, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import {
  DocumentContent,
  useDocumentManagerCapability,
} from '@embedpdf/plugin-document-manager/react';
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

import { basename, confirmDiscard, isDesktopRuntime } from './file-bridge';
import {
  colorOf,
  colorPatchFor,
  loadSetting,
  PALETTES,
  patchFor,
  saveSetting,
  STROKE_WIDTHS,
  supportsStrokeWidth,
  toolForSubtype,
  type ToolId,
  type ToolSetting,
} from './tool-settings';
import {
  documentsWithUnsavedEdits,
  forgetDocument,
  getDocumentFile,
  type EditEntry,
  type SaveRevision,
} from './document-store';
import {
  useDeleteSelected,
  useDocumentFile,
  useEditTimeline,
  useOpenPdf,
  usePdfSave,
  useRecoverDraft,
  useSelectedAnnotations,
  type SaveOutcome,
} from './use-pdf-file';

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
  const openPdf = useOpenPdf();

  const closeTab = async (documentId: string) => {
    const pending = getDocumentFile(documentId).pendingEdits;
    if (pending > 0) {
      const discard = await confirmDiscard(
        `${pending} unsaved change${pending === 1 ? '' : 's'} will be lost. Close this PDF anyway?`,
      );
      if (!discard) return;
    }
    provides?.closeDocument(documentId);
    forgetDocument(documentId);
  };

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
              void closeTab(document.id);
            }}
            role="button"
            aria-label="Close tab"
            tabIndex={0}
          >
            ×
          </span>
        </button>
      ))}
      <button className="icon-button" onClick={() => void openPdf()} title="Open PDF">
        +
      </button>
    </div>
  );
}

/**
 * Colour and width for whichever tool is in hand.
 *
 * Shown only while a tool is active, so the toolbar stays quiet when reading. The
 * choice is pushed into the plugin's tool defaults and remembered, because picking
 * your highlighter colour again on every launch would be its own small tax.
 */
function ToolSettings({ toolId }: { toolId: ToolId }) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const [setting, setSetting] = useState<ToolSetting>(() => loadSetting(toolId));

  useEffect(() => {
    setSetting(loadSetting(toolId));
  }, [toolId]);

  useEffect(() => {
    annotationCapability?.setToolDefaults(toolId, patchFor(toolId, setting));
    saveSetting(toolId, setting);
  }, [annotationCapability, setting, toolId]);

  return (
    <div className="tool-settings">
      {PALETTES[toolId].map((color) => (
        <button
          aria-label={`Colour ${color}`}
          aria-pressed={setting.color.toLowerCase() === color.toLowerCase()}
          className={
            setting.color.toLowerCase() === color.toLowerCase() ? 'swatch active' : 'swatch'
          }
          key={color}
          onClick={() => setSetting((current) => ({ ...current, color }))}
          style={{ background: color }}
          title={color}
        />
      ))}
      {supportsStrokeWidth(toolId) && (
        <>
          <span className="toolbar-divider" />
          {STROKE_WIDTHS.map((width) => (
            <button
              aria-label={`Stroke width ${width}`}
              aria-pressed={setting.strokeWidth === width}
              className={setting.strokeWidth === width ? 'width-pick active' : 'width-pick'}
              key={width}
              onClick={() => setSetting((current) => ({ ...current, strokeWidth: width }))}
              title={`${width} pt`}
            >
              <span style={{ height: Math.max(2, width / 1.5) }} />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * The same picker, but bound to a mark already on the page.
 *
 * Without this the only way to recolour or thin an existing annotation is to delete it
 * and draw it again — the sort of friction this app exists to remove.
 */
function SelectionSettings({ documentId }: { documentId: string }) {
  const { selected, update } = useSelectedAnnotations(documentId);
  if (selected.length !== 1) return null;

  const target = selected[0]!.object as unknown as Record<string, unknown> & {
    id: string;
    pageIndex: number;
    type: number;
    strokeWidth?: number;
  };
  const toolId = toolForSubtype(target.type);
  if (!toolId) return null;

  const current = colorOf(toolId, target);

  return (
    <div className="tool-settings selection">
      <span className="toolbar-group-label">Selected</span>
      {PALETTES[toolId].map((color) => (
        <button
          aria-label={`Colour ${color}`}
          aria-pressed={current?.toLowerCase() === color.toLowerCase()}
          className={current?.toLowerCase() === color.toLowerCase() ? 'swatch active' : 'swatch'}
          key={color}
          onClick={() => update(target.pageIndex, target.id, colorPatchFor(toolId, color))}
          style={{ background: color }}
          title={color}
        />
      ))}
      {supportsStrokeWidth(toolId) && (
        <>
          <span className="toolbar-divider" />
          {STROKE_WIDTHS.map((width) => (
            <button
              aria-label={`Stroke width ${width}`}
              aria-pressed={target.strokeWidth === width}
              className={target.strokeWidth === width ? 'width-pick active' : 'width-pick'}
              key={width}
              onClick={() => update(target.pageIndex, target.id, { strokeWidth: width })}
              title={`${width} pt`}
            >
              <span style={{ height: Math.max(2, width / 1.5) }} />
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function PdfToolbar({ documentId, documentName }: { documentId: string; documentName: string }) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: historyCapability } = useHistoryCapability();
  const { provides: printProvider } = usePrint(documentId);
  const { save, saveAs } = usePdfSave(documentId, documentName);
  const file = useDocumentFile(documentId);
  const [saveState, setSaveState] = useState<string | null>(null);
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

  const describe = (outcome: SaveOutcome): string | null => {
    if (outcome.status === 'cancelled') return null;
    if (outcome.status === 'downloaded') return 'Downloaded a copy';
    return `Saved to ${basename(outcome.path)}`;
  };

  /**
   * Engine and IPC failures arrive as things like
   * `Task rejected: {"code":14,"message":"Document doc-123 not found"}`. Showing that
   * to someone who just wanted to keep their notes is useless, so it goes to the
   * console and they get something they can act on.
   */
  const describeFailure = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error);
    if (/forbidden path|not allowed/i.test(message)) {
      return 'Save failed — Iroha PDF is not allowed to write there.';
    }
    if (/ENOSPC|no space left/i.test(message)) return 'Save failed — the disk is full.';
    if (/EACCES|permission denied|read-only/i.test(message)) {
      return 'Save failed — that file is not writable.';
    }
    if (/not found/i.test(message)) return 'Save failed — this document is not open.';
    return 'Save failed — the PDF could not be written.';
  };

  const runSave = async (action: () => Promise<SaveOutcome>) => {
    setSaveState('Saving…');
    try {
      setSaveState(describe(await action()));
    } catch (error) {
      console.error('Iroha PDF: save failed', error);
      setSaveState(describeFailure(error));
    }
  };

  const unsaved = file.pendingEdits > 0;

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
      {activeTool ? (
        <ToolSettings toolId={activeTool as ToolId} />
      ) : (
        <SelectionSettings documentId={documentId} />
      )}
      <span className="toolbar-divider" />
      <button className="tool" onClick={() => history?.undo()}>Undo</button>
      <button className="tool" onClick={() => history?.redo()}>Redo</button>
      <span className="toolbar-spacer" />
      {saveState && <span className="save-state">{saveState}</span>}
      <button className="tool" onClick={() => void runSave(saveAs)}>
        {isDesktopRuntime() ? 'Save as…' : 'Download copy'}
      </button>
      <button className="tool" onClick={() => setPrintOpen(true)}>
        Print
      </button>
      <button className={unsaved ? 'primary-button unsaved' : 'primary-button'} onClick={() => void runSave(save)}>
        {unsaved ? `Save (${file.pendingEdits})` : 'Save'}
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

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(0)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

function HistoryPanel({ documentId }: { documentId: string }) {
  const file = useDocumentFile(documentId);

  // Newest first: the most recent change is the one being reasoned about.
  const timeline = useMemo(() => {
    const edits: Array<{ at: number; entry: EditEntry }> = file.edits.map((entry) => ({
      at: entry.at,
      entry,
    }));
    const saves: Array<{ at: number; revision: SaveRevision }> = file.revisions.map(
      (revision) => ({ at: revision.at, revision }),
    );
    return [...edits, ...saves].sort((a, b) => b.at - a.at);
  }, [file.edits, file.revisions]);

  if (timeline.length === 0) {
    return (
      <p className="history-empty">
        No edits yet. Highlights, pen strokes, and text you add will be listed here, along
        with every time this PDF was saved.
      </p>
    );
  }

  return (
    <ol className="history-list">
      {timeline.map((item, index) => {
        const isSave = 'revision' in item;
        return (
          <li className={isSave ? 'history-item save' : 'history-item edit'} key={`${item.at}-${index}`}>
            <span className="history-time">{timeFormat.format(item.at)}</span>
            {isSave ? (
              <span className="history-label">
                {item.revision.kind === 'save-as' ? 'Saved as' : 'Saved'}{' '}
                <strong>{basename(item.revision.path)}</strong>
                <span className="history-meta">
                  {formatBytes(item.revision.byteLength)} · {item.revision.editCount} edit
                  {item.revision.editCount === 1 ? '' : 's'}
                </span>
              </span>
            ) : (
              <span className="history-label">
                {item.entry.kind === 'create' && 'Added '}
                {item.entry.kind === 'update' && 'Changed '}
                {item.entry.kind === 'delete' && 'Removed '}
                <strong>{item.entry.label}</strong>
                <span className="history-meta">page {item.entry.pageIndex + 1}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function NotePanel({ documentId }: { documentId: string }) {
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
    <>
      <textarea
        className="note-body"
        value={note.body}
        onChange={(event) => setNote((current) => ({
          ...current,
          body: event.target.value,
          updatedAt: new Date().toISOString(),
        }))}
        placeholder="Write a memo for this PDF…"
        aria-label="Linked note"
      />
      <span className="saved-indicator">Autosaved locally</span>
    </>
  );
}

function SidePanel({ documentId }: { documentId: string }) {
  const [tab, setTab] = useState<'history' | 'note'>('history');
  const file = useDocumentFile(documentId);

  return (
    <aside className="side-panel">
      <div className="side-panel-tabs" role="tablist" aria-label="Document details">
        <button
          className={tab === 'history' ? 'panel-tab active' : 'panel-tab'}
          onClick={() => setTab('history')}
          role="tab"
          aria-selected={tab === 'history'}
        >
          Edit history
        </button>
        <button
          className={tab === 'note' ? 'panel-tab active' : 'panel-tab'}
          onClick={() => setTab('note')}
          role="tab"
          aria-selected={tab === 'note'}
        >
          Note
        </button>
      </div>
      {tab === 'history' && file.path && (
        <p className="side-panel-path" title={file.path}>
          {file.path}
        </p>
      )}
      {tab === 'history' ? <HistoryPanel documentId={documentId} /> : <NotePanel documentId={documentId} />}
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
  const openPdf = useOpenPdf();

  return (
    <section className="empty-workspace">
      <div className="empty-mark">い</div>
      <h1>Your documents, without the clutter.</h1>
      <p>Open a PDF to read, annotate, and save your changes straight back to the file.</p>
      <button className="primary-button large" onClick={() => void openPdf()}>Open PDF</button>
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
        <strong>Unsaved work recovered.</strong> {count} annotation{count === 1 ? '' : 's'} from{' '}
        {timeFormat.format(file.recovery.savedAt)} never reached this file.
      </span>
      <span className="recovery-actions">
        <button className="tool" onClick={discard}>
          Discard
        </button>
        <button className="primary-button" onClick={restore}>
          Restore
        </button>
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
      <RecoveryBanner documentId={documentId} />
    </>
  );
}

/**
 * Closing the window is the other way work disappears. beforeunload cannot be async,
 * so this only marks the event; the runtime shows its own confirmation.
 */
function useUnsavedGuard(): void {
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (documentsWithUnsavedEdits().length === 0) return;
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
  const isLoaded = active?.status === 'loaded';

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-mark">い</span> Iroha PDF</div>
        <div className="header-status"><span className="status-dot" /> Local-first</div>
      </header>
      <TabStrip activeDocumentId={activeDocumentId} documents={documentStates} documentStates={documentStates} />
      {activeDocumentId ? (
        <>
          {isLoaded && (
            <ActiveDocument documentId={activeDocumentId} documentName={activeName} />
          )}
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
            <SidePanel documentId={activeDocumentId} />
          </div>
        </>
      ) : (
        <EmptyWorkspace />
      )}
    </main>
  );
}
