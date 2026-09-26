/**
 * The page organizer: the open document's pages as a grid to rearrange, turn,
 * copy, remove and pad with blank pages, saved as a new PDF.
 *
 * #17 asked for the interface the core operations lacked — drag to reorder,
 * multi-select, duplicate as something a person can find, and undo — and #18 for
 * the grid of pictures that makes dragging possible without drawing all of a long
 * document at once. The pictures come from the same lazy store the side panel's
 * strip uses, so a 500-page document still draws only what is near the view.
 *
 * Everything here edits a plan (`organizer-plan.ts`). The open document is not
 * touched: saving writes the plan to a file the user names, like every page
 * operation on this platform, for the reason given there.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';

import { confirmDiscard } from './file-bridge';
import { t } from './i18n';
import {
  blankSizeFor,
  initialPlan,
  isUnchanged,
  organizerReducer,
  type OrganizerAction,
  type PlanPage,
} from './organizer-plan';
import { useDocument, useLazyThumbnail, useThumbnailStore } from './PageThumbnails';
import type { ThumbnailStore } from './thumbnails';

type Size = { width: number; height: number };

/** Pointer travel, in CSS pixels, before a press on a page becomes a drag. */
const DRAG_THRESHOLD_PX = 6;
/** How close to the grid's top or bottom edge a drag starts scrolling it, and by how much per move. */
const AUTOSCROLL_EDGE_PX = 32;
const AUTOSCROLL_STEP_PX = 16;

/**
 * Each page's size as it is seen, for sizing a blank page to match its neighbour.
 *
 * The engine reports `size` before the page's own /Rotate is applied, and the
 * rotation beside it in quarter turns; a page stored portrait and turned a
 * quarter is on screen landscape, and that is the size a reader expects a page
 * inserted after it to have.
 */
function usePageSizes(documentId: string): (source: number) => Size | undefined {
  const { provides } = useDocumentManagerCapability();
  return useCallback(
    (source: number) => {
      const page = provides?.getDocument(documentId)?.pages[source];
      if (!page) return undefined;
      const { width, height } = page.size;
      return page.rotation % 2 === 1 ? { width: height, height: width } : { width, height };
    },
    [provides, documentId],
  );
}

function pageLabel(page: PlanPage): string {
  if (page.kind === 'blank') return t('organize.blank');
  return page.rotation === 0
    ? t('thumbnails.page', { page: page.source + 1 })
    : t('organize.turned', { page: page.source + 1, degrees: page.rotation });
}

/**
 * Where a drop over `index` lands, counted among the pages that are not moving —
 * which is how `move-selected` counts. The left half of a page means before it.
 */
function dropSlot(pages: PlanPage[], selected: string[], index: number, after: boolean): number {
  const boundary = after ? index + 1 : index;
  return pages.slice(0, boundary).filter((page) => !selected.includes(page.id)).length;
}

type TileProps = {
  page: PlanPage;
  position: number;
  total: number;
  store: ThumbnailStore;
  selected: boolean;
  focused: boolean;
  dropSide: 'before' | 'after' | null;
  onPointerSelect: (event: MouseEvent, page: PlanPage) => void;
  onPointerDown: (event: PointerEvent, page: PlanPage) => void;
  onFocusTile: () => void;
  tileRef: (element: HTMLLIElement | null) => void;
};

function PageTile({ page, store, ...props }: TileProps) {
  // Blank pages have no picture; asking the store for one would render page 0.
  const [lazyRef, url] = useLazyThumbnail<HTMLLIElement>(store, page.kind === 'page' ? page.source : -1);
  const setRef = (element: HTMLLIElement | null) => {
    lazyRef.current = page.kind === 'page' ? element : null;
    props.tileRef(element);
  };
  const turn = page.kind === 'page' ? page.rotation : 0;
  const className = [
    'organizer-tile',
    props.selected ? 'selected' : '',
    props.dropSide ? `drop-${props.dropSide}` : '',
  ].join(' ').trim();

  return (
    <li
      ref={setRef}
      className={className}
      role="option"
      aria-selected={props.selected}
      aria-label={pageLabel(page)}
      aria-posinset={props.position + 1}
      aria-setsize={props.total}
      tabIndex={props.focused ? 0 : -1}
      data-plan-id={page.id}
      onClick={(event) => props.onPointerSelect(event, page)}
      onPointerDown={(event) => props.onPointerDown(event, page)}
      onFocus={props.onFocusTile}
    >
      <span className="organizer-frame">
        {page.kind === 'blank' ? (
          <span className="organizer-blank" aria-hidden="true" />
        ) : url ? (
          <img
            className={turn % 180 === 0 ? 'organizer-image' : 'organizer-image quarter'}
            style={{ transform: `translate(-50%, -50%) rotate(${turn}deg)` }}
            src={url}
            alt=""
            draggable={false}
          />
        ) : (
          <span className="thumbnail-placeholder" aria-hidden="true" />
        )}
      </span>
      <span className="thumbnail-number" aria-hidden="true">
        {props.position + 1}
        {page.kind === 'page' && page.source !== props.position ? ` · ${page.source + 1}` : ''}
      </span>
    </li>
  );
}

export function PageOrganizer({
  documentId,
  documentName,
  onClose,
  onSave,
}: {
  documentId: string;
  documentName: string;
  onClose: () => void;
  /** Writes the plan to a new file. Resolves once that is settled either way. */
  onSave: (pages: PlanPage[]) => Promise<void>;
}) {
  const openDocument = useDocument(documentId);
  const store = useThumbnailStore(documentId, openDocument);
  const sizeOf = usePageSizes(documentId);
  const [state, dispatch] = useReducer(organizerReducer, 0, initialPlan);
  // Focus follows a page, not a position, so a page moved from the keyboard
  // keeps the focus and can be moved again.
  const [focusId, setFocusId] = useState<string | null>(null);
  const lastFocusIndex = useRef(0);
  const [drop, setDrop] = useState<{ position: number; after: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const tiles = useRef(new Map<string, HTMLLIElement>());
  const gridRef = useRef<HTMLOListElement>(null);
  const unchanged = isUnchanged(state);
  const pageCount = openDocument?.pageCount ?? 0;

  useEffect(() => {
    dispatch({ type: 'load', pageCount });
  }, [pageCount]);

  const close = useCallback(async () => {
    if (!unchanged && !(await confirmDiscard(t('organize.discard')))) return;
    onClose();
  }, [onClose, unchanged]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      void close();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [close]);

  const total = state.pages.length;
  const found = state.pages.findIndex((page) => page.id === focusId);
  // A focused page that was deleted hands focus to whatever took its place.
  const focusedIndex = found >= 0 ? found : Math.min(lastFocusIndex.current, Math.max(0, total - 1));
  lastFocusIndex.current = focusedIndex;
  const focusedId = state.pages[focusedIndex]?.id ?? null;

  const moveFocus = (to: number) => {
    const next = state.pages[Math.max(0, Math.min(to, total - 1))];
    if (!next) return;
    setFocusId(next.id);
    tiles.current.get(next.id)?.focus();
  };

  // Reordering moves DOM nodes, and a node that moves loses focus. Put it back on
  // the page it belongs to, but only if focus was in the grid to begin with.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !focusedId) return;
    const active = document.activeElement;
    // Focus that is somewhere else on purpose — a toolbar button just pressed —
    // stays there. Only focus the move dropped (onto the body) or left on a
    // different tile is put back.
    if (active !== document.body && !grid.contains(active)) return;
    const tile = tiles.current.get(focusedId);
    if (tile && active !== tile) tile.focus();
  }, [state.pages, focusedId]);

  const act = (action: OrganizerAction) => dispatch(action);

  const onPointerSelect = (event: MouseEvent, page: PlanPage) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const mode = event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace';
    act({ type: 'select', id: page.id, mode });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const command = event.metaKey || event.ctrlKey;
    const key = event.key;
    const current = state.pages[focusedIndex];
    const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : key === 'ArrowRight' || key === 'ArrowDown' ? 1 : 0;

    if (step !== 0 && event.altKey) {
      // Alt+arrow carries the selection, which is how a keyboard drags.
      event.preventDefault();
      if (state.selected.length === 0 && current) act({ type: 'select', id: current.id, mode: 'replace' });
      act({ type: 'shift-selected', by: step });
      return;
    }
    if (step !== 0) {
      event.preventDefault();
      const next = Math.max(0, Math.min(focusedIndex + step, total - 1));
      moveFocus(next);
      const target = state.pages[next];
      if (target && event.shiftKey) act({ type: 'select', id: target.id, mode: 'range' });
      return;
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault();
      moveFocus(key === 'Home' ? 0 : total - 1);
      return;
    }
    if ((key === ' ' || key === 'Enter') && current) {
      event.preventDefault();
      act({ type: 'select', id: current.id, mode: key === ' ' ? 'toggle' : 'replace' });
      return;
    }
    if (command && key.toLowerCase() === 'a') {
      event.preventDefault();
      act({ type: 'select-all' });
      return;
    }
    if (command && key.toLowerCase() === 'd') {
      event.preventDefault();
      act({ type: 'duplicate-selected' });
      return;
    }
    if (command && key.toLowerCase() === 'z') {
      event.preventDefault();
      act({ type: event.shiftKey ? 'redo' : 'undo' });
      return;
    }
    if (command && key.toLowerCase() === 'y') {
      event.preventDefault();
      act({ type: 'redo' });
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      act({ type: 'delete-selected' });
    }
  };

  /**
   * Dragging is done with pointer events rather than HTML5 drag and drop. The
   * desktop window leaves Tauri's native file drop on (`dragDropEnabled` is not
   * set, and defaults to true), and on Windows that takes HTML5 drag and drop
   * away from the webview; pointer events behave the same in every webview this
   * ships in, and a pen drags too.
   */
  const drag = useRef<{ id: string; pointerId: number; x: number; y: number; moving: boolean } | null>(null);
  // The click that ends a drag is not a selection.
  const suppressClick = useRef(false);

  const onPointerDown = (event: PointerEvent, page: PlanPage) => {
    if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey) return;
    drag.current = { id: page.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moving: false };
  };

  /** The tile under the pointer and which half of it, or null over a gap or outside. */
  const dropTargetAt = (x: number, y: number): { position: number; after: boolean } | null => {
    const tileElement = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-plan-id]');
    if (!tileElement || !gridRef.current?.contains(tileElement)) return null;
    const position = state.pages.findIndex((page) => page.id === tileElement.dataset.planId);
    if (position < 0) return null;
    const rect = tileElement.getBoundingClientRect();
    return { position, after: x > rect.left + rect.width / 2 };
  };

  const onGridPointerMove = (event: PointerEvent<HTMLOListElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.moving) {
      // A few pixels of travel before it counts, so a click that wobbles is a click.
      if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_THRESHOLD_PX) return;
      current.moving = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      // Dragging an unselected page drags that page alone, as in every file manager.
      if (!state.selected.includes(current.id)) act({ type: 'select', id: current.id, mode: 'replace' });
    }
    const target = dropTargetAt(event.clientX, event.clientY);
    if (target?.position !== drop?.position || target?.after !== drop?.after) setDrop(target);
    // Near an edge of the grid, scroll it, so a page can be carried further than one screen.
    const grid = event.currentTarget.getBoundingClientRect();
    if (event.clientY < grid.top + AUTOSCROLL_EDGE_PX) event.currentTarget.scrollBy(0, -AUTOSCROLL_STEP_PX);
    else if (event.clientY > grid.bottom - AUTOSCROLL_EDGE_PX) event.currentTarget.scrollBy(0, AUTOSCROLL_STEP_PX);
  };

  const endDrag = (event: PointerEvent<HTMLOListElement>, commit: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (!current.moving) return;
    suppressClick.current = true;
    const target = commit ? dropTargetAt(event.clientX, event.clientY) ?? drop : null;
    setDrop(null);
    if (!target) return;
    const selected = state.selected.includes(current.id) ? state.selected : [current.id];
    act({ type: 'move-selected', to: dropSlot(state.pages, selected, target.position, target.after) });
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave(state.pages);
    } finally {
      setBusy(false);
    }
  };

  const hasSelection = state.selected.length > 0;
  const deletable = hasSelection && state.selected.length < total;
  const selectionHasPages = state.pages.some((page) => page.kind === 'page' && state.selected.includes(page.id));
  const blank = useMemo(() => blankSizeFor(state, sizeOf), [state, sizeOf]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => void close()}>
      <section
        ref={dialogRef}
        className="print-dialog organizer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="organizer-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="organizer-title">{t('organize.title')}</h2>
        <p className="dialog-hint">{documentName}</p>
        <div className="organizer-toolbar" role="toolbar" aria-label={t('organize.actions')}>
          <button className="tool" disabled={state.past.length === 0} onClick={() => act({ type: 'undo' })}>
            {t('edit.undo')}
          </button>
          <button className="tool" disabled={state.future.length === 0} onClick={() => act({ type: 'redo' })}>
            {t('edit.redo')}
          </button>
          <span className="toolbar-divider" />
          <button className="tool" disabled={!selectionHasPages} onClick={() => act({ type: 'rotate-selected', by: 270 })}>
            {t('organize.rotateLeft')}
          </button>
          <button className="tool" disabled={!selectionHasPages} onClick={() => act({ type: 'rotate-selected', by: 90 })}>
            {t('organize.rotateRight')}
          </button>
          <button className="tool" disabled={!hasSelection} onClick={() => act({ type: 'duplicate-selected' })}>
            {t('organize.duplicate')}
          </button>
          <button className="tool" disabled={!deletable} onClick={() => act({ type: 'delete-selected' })}>
            {t('organize.delete')}
          </button>
          <button className="tool" onClick={() => act({ type: 'insert-blank', ...blank })}>
            {t('organize.insertBlank')}
          </button>
          <span className="toolbar-divider" />
          <button className="tool" onClick={() => act({ type: hasSelection ? 'clear-selection' : 'select-all' })}>
            {t(hasSelection ? 'organize.selectNone' : 'organize.selectAll')}
          </button>
        </div>
        <p className="dialog-hint">{t('organize.hint')}</p>
        {store && total > 0 ? (
          <ol
            ref={gridRef}
            className="organizer-grid"
            role="listbox"
            aria-multiselectable="true"
            aria-label={t('organize.list')}
            onKeyDown={onKeyDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={(event) => endDrag(event, true)}
            onPointerCancel={(event) => endDrag(event, false)}
          >
            {state.pages.map((page, position) => (
              <PageTile
                key={page.id}
                page={page}
                position={position}
                total={total}
                store={store}
                selected={state.selected.includes(page.id)}
                focused={page.id === focusedId}
                dropSide={drop?.position === position ? (drop.after ? 'after' : 'before') : null}
                onPointerSelect={onPointerSelect}
                onPointerDown={onPointerDown}
                onFocusTile={() => setFocusId(page.id)}
                tileRef={(element) => {
                  if (element) tiles.current.set(page.id, element);
                  else tiles.current.delete(page.id);
                }}
              />
            ))}
          </ol>
        ) : (
          <p className="history-empty">{t('thumbnails.empty')}</p>
        )}
        <p className="organizer-summary" role="status">
          {t('organize.summary', { count: total, selected: state.selected.length })}
        </p>
        <p className="dialog-hint">{t('organize.untouched')}</p>
        <div className="dialog-actions">
          <button className="tool" onClick={() => void close()}>{t('action.cancel')}</button>
          <button className="primary-button" disabled={busy || unchanged} onClick={() => void save()}>
            {busy ? t('pages.working') : t('organize.save')}
          </button>
        </div>
      </section>
    </div>
  );
}
