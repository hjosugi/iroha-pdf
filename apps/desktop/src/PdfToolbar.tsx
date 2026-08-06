import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useHistoryCapability } from '@embedpdf/plugin-history/react';
import { usePrint } from '@embedpdf/plugin-print/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';

import { basename, isDesktopRuntime } from './file-bridge';
import { t } from './i18n';
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
  useAnnotationScope,
  useDocumentFile,
  usePdfSave,
  useSelectedAnnotations,
  type SaveOutcome,
} from './use-pdf-file';

const TOOL_LABELS = [
  ['highlight', 'edit.highlight'],
  ['ink', 'edit.pen'],
  ['freeText', 'edit.text'],
  ['square', 'edit.shape'],
] as const;

type PrintMode = 'all' | 'current' | 'custom';

/** One row of the palette, whether the colour is being chosen for a tool or for a mark. */
function SwatchRow({
  colors,
  current,
  onPick,
}: {
  colors: string[];
  current: string | null | undefined;
  onPick: (color: string) => void;
}) {
  return (
    <>
      {colors.map((color) => {
        const active = current?.toLowerCase() === color.toLowerCase();
        return (
          <button
            aria-label={t('edit.color', { color })}
            aria-pressed={active}
            className={active ? 'swatch active' : 'swatch'}
            key={color}
            onClick={() => onPick(color)}
            style={{ background: color }}
            title={color}
          />
        );
      })}
    </>
  );
}

/** The widths a line can take, preceded by the divider that separates them from the colours. */
function WidthRow({
  current,
  onPick,
}: {
  current: number | undefined;
  onPick: (width: number) => void;
}) {
  return (
    <>
      <span className="toolbar-divider" />
      {STROKE_WIDTHS.map((width) => (
        <button
          aria-label={t('edit.strokeWidth', { width })}
          aria-pressed={current === width}
          className={current === width ? 'width-pick active' : 'width-pick'}
          key={width}
          onClick={() => onPick(width)}
          title={`${width} pt`}
        >
          <span style={{ height: Math.max(2, width / 1.5) }} />
        </button>
      ))}
    </>
  );
}

/**
 * Colour and width for whichever tool is in hand.
 *
 * Shown only while a tool is active, so the toolbar stays quiet when reading. The
 * choice is pushed into the plugin's tool defaults and remembered, because picking
 * your highlighter colour again on every launch would be its own small tax. The
 * caller keys this on the tool, so switching tools brings up that tool's own setting.
 */
function ToolSettings({ toolId }: { toolId: ToolId }) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const [setting, setSetting] = useState<ToolSetting>(() => loadSetting(toolId));

  useEffect(() => {
    annotationCapability?.setToolDefaults(toolId, patchFor(toolId, setting));
    saveSetting(toolId, setting);
  }, [annotationCapability, setting, toolId]);

  return (
    <div className="tool-settings">
      <SwatchRow
        colors={PALETTES[toolId]}
        current={setting.color}
        onPick={(color) => setSetting((current) => ({ ...current, color }))}
      />
      {supportsStrokeWidth(toolId) && (
        <WidthRow
          current={setting.strokeWidth}
          onPick={(strokeWidth) => setSetting((current) => ({ ...current, strokeWidth }))}
        />
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

  return (
    <div className="tool-settings selection">
      <span className="toolbar-group-label">{t('edit.selected')}</span>
      <SwatchRow
        colors={PALETTES[toolId]}
        current={colorOf(toolId, target)}
        onPick={(color) => update(target.pageIndex, target.id, colorPatchFor(toolId, color))}
      />
      {supportsStrokeWidth(toolId) && (
        <WidthRow
          current={target.strokeWidth}
          onPick={(strokeWidth) => update(target.pageIndex, target.id, { strokeWidth })}
        />
      )}
    </div>
  );
}

/**
 * What to print, asked before handing the document to the platform's print preview.
 *
 * Stays mounted while closed so a range typed once survives a cancelled dialog.
 */
function PrintDialog({
  open,
  currentPage,
  onClose,
  onPrint,
}: {
  open: boolean;
  currentPage: number;
  onClose: () => void;
  onPrint: (options: { includeAnnotations: boolean; pageRange: string | undefined }) => void;
}) {
  const [printMode, setPrintMode] = useState<PrintMode>('all');
  const [pageRange, setPageRange] = useState('');
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="print-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="print-dialog-title">{t('print.dialogTitle')}</h2>
        <fieldset>
          <legend>{t('print.pages')}</legend>
          <label><input type="radio" checked={printMode === 'all'} onChange={() => setPrintMode('all')} /> {t('print.allPages')}</label>
          <label><input type="radio" checked={printMode === 'current'} onChange={() => setPrintMode('current')} /> {t('print.currentPage')} ({currentPage})</label>
          <label><input type="radio" checked={printMode === 'custom'} onChange={() => setPrintMode('custom')} /> {t('print.range')}</label>
          <input aria-label={t('print.pageRange')} disabled={printMode !== 'custom'} value={pageRange} onChange={(event) => setPageRange(event.target.value)} placeholder={t('print.rangePlaceholder')} />
        </fieldset>
        <label className="print-checkbox">
          <input type="checkbox" checked={includeAnnotations} onChange={(event) => setIncludeAnnotations(event.target.checked)} />
          {t('print.includeAnnotations')}
        </label>
        <div className="dialog-actions">
          <button className="tool" onClick={onClose}>{t('action.cancel')}</button>
          <button
            className="primary-button"
            disabled={printMode === 'custom' && !pageRange.trim()}
            onClick={() =>
              onPrint({
                includeAnnotations,
                pageRange:
                  printMode === 'current'
                    ? String(currentPage)
                    : printMode === 'custom' ? pageRange.trim() : undefined,
              })
            }
          >
            {t('print.openPreview')}
          </button>
        </div>
      </section>
    </div>
  );
}

function describeOutcome(outcome: SaveOutcome): string | null {
  if (outcome.status === 'cancelled') return null;
  if (outcome.status === 'downloaded') return t('save.downloaded');
  return t('save.savedTo', { name: basename(outcome.path) });
}

/**
 * Engine and IPC failures arrive as things like
 * `Task rejected: {"code":14,"message":"Document doc-123 not found"}`. Showing that
 * to someone who just wanted to keep their notes is useless, so it goes to the
 * console and they get something they can act on.
 */
function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Every failure path leaves the document alone — the new bytes are assembled beside
  // it and only become the document in one rename — so every one of these can say so.
  return `${reasonFor(message)} ${t('save.unchanged')}`;
}

function reasonFor(message: string): string {
  if (/forbidden path|not allowed/i.test(message)) {
    return t('save.notAllowed');
  }
  if (/ENOSPC|no space left|disk is full/i.test(message)) return t('save.diskFull');
  if (/EACCES|permission denied|read-only/i.test(message)) {
    return t('save.notWritable');
  }
  if (/not found/i.test(message)) return t('save.notOpen');
  return t('save.failed');
}

export function PdfToolbar({
  documentId,
  documentName,
}: {
  documentId: string;
  documentName: string;
}) {
  const annotation = useAnnotationScope(documentId);
  const { provides: historyCapability } = useHistoryCapability();
  const { provides: printProvider } = usePrint(documentId);
  const { save, saveAs } = usePdfSave(documentId, documentName);
  const file = useDocumentFile(documentId);
  const [saveState, setSaveState] = useState<string | null>(null);
  const history = useMemo(
    () => historyCapability?.forDocument(documentId),
    [historyCapability, documentId],
  );
  const { state: scrollState } = useScroll(documentId);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const printButtonRef = useRef<HTMLButtonElement>(null);

  const closePrint = useCallback(() => {
    setPrintOpen(false);
    window.requestAnimationFrame(() => printButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!annotation) return;
    setActiveTool(annotation.getActiveTool()?.id ?? null);
    return annotation.onActiveToolChange((tool) => setActiveTool(tool?.id ?? null));
  }, [annotation]);

  const toggleTool = (tool: string) => {
    annotation?.setActiveTool(activeTool === tool ? null : tool);
  };

  const runSave = async (action: () => Promise<SaveOutcome>) => {
    setSaveState(t('save.saving'));
    try {
      setSaveState(describeOutcome(await action()));
    } catch (error) {
      console.error('Iroha PDF: save failed', error);
      setSaveState(describeFailure(error));
    }
  };

  const unsaved = file.pendingEdits > 0;

  return (
    <div className="pdf-toolbar">
      <span className="toolbar-group-label">{t('edit.label')}</span>
      {TOOL_LABELS.map(([tool, labelKey]) => (
        <button
          aria-pressed={activeTool === tool}
          className={activeTool === tool ? 'tool active' : 'tool'}
          key={tool}
          onClick={() => toggleTool(tool)}
        >
          {t(labelKey)}
        </button>
      ))}
      <span className="toolbar-divider" />
      {activeTool ? (
        <ToolSettings key={activeTool} toolId={activeTool as ToolId} />
      ) : (
        <SelectionSettings documentId={documentId} />
      )}
      <span className="toolbar-divider" />
      <button className="tool" onClick={() => history?.undo()}>{t('edit.undo')}</button>
      <button className="tool" onClick={() => history?.redo()}>{t('edit.redo')}</button>
      <span className="toolbar-spacer" />
      {saveState && <span className="save-state">{saveState}</span>}
      <button className="tool" onClick={() => void runSave(saveAs)}>
        {t(isDesktopRuntime() ? 'save.saveAs' : 'save.downloadCopy')}
      </button>
      <button ref={printButtonRef} className="tool" onClick={() => setPrintOpen(true)}>
        {t('print.open')}
      </button>
      <button className={unsaved ? 'primary-button unsaved' : 'primary-button'} onClick={() => void runSave(save)}>
        {unsaved ? t('save.saveCount', { count: file.pendingEdits }) : t('save.save')}
      </button>
      <PrintDialog
        open={printOpen}
        currentPage={scrollState.currentPage || 1}
        onClose={closePrint}
        onPrint={(options) => {
          printProvider?.print(options);
          closePrint();
        }}
      />
    </div>
  );
}
