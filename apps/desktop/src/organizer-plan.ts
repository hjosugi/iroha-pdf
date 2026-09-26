/**
 * The page organizer's model: which pages the new document will have, in what
 * order and turned how far, which of them are selected, and the steps that can be
 * taken back.
 *
 * It is a plan over the open document rather than an edit of it. Nothing here
 * touches the document until the plan is saved, and then it is saved as a new
 * file (`organizePdf` in core) — the same reason every page operation on this
 * platform leaves the open document alone: it has unsaved annotations, a draft and
 * an edit history keyed to its path, and rearranging its pages underneath those
 * would be a way to lose them.
 *
 * Kept free of React and of the engine so every rule — what a move does to a
 * selection, what undo restores, what may not be deleted — is tested directly.
 */
import type { OrganizedPage, QuarterTurn } from '@iroha-pdf/core';

export type PlanPage =
  | { id: string; kind: 'page'; source: number; rotation: QuarterTurn }
  | { id: string; kind: 'blank'; width: number; height: number };

export type OrganizerState = {
  pages: PlanPage[];
  /** Ids, not positions: a selection has to survive the pages moving under it. */
  selected: string[];
  /** Where a Shift-extended selection is measured from. */
  anchor: string | null;
  /** Earlier page lists, most recent last. Selection is not history. */
  past: PlanPage[][];
  future: PlanPage[][];
  /** Mints ids for copies and blank pages; never reused within a session. */
  nextId: number;
  /** How many pages the open document has. */
  sourcePageCount: number;
};

/** Enough to recover from a long session of mistakes without holding every list. */
export const HISTORY_LIMIT = 200;

export type OrganizerAction =
  /** The engine reported the page count; start the plan from it, once. */
  | { type: 'load'; pageCount: number }
  | { type: 'select'; id: string; mode: 'replace' | 'toggle' | 'range' }
  | { type: 'select-all' }
  | { type: 'clear-selection' }
  | { type: 'move-selected'; to: number }
  | { type: 'shift-selected'; by: -1 | 1 }
  | { type: 'duplicate-selected' }
  | { type: 'delete-selected' }
  | { type: 'rotate-selected'; by: 90 | 270 }
  | { type: 'insert-blank'; width: number; height: number }
  | { type: 'undo' }
  | { type: 'redo' };

export function initialPlan(pageCount: number): OrganizerState {
  return {
    pages: Array.from({ length: pageCount }, (_, source) => ({
      id: `p${source}`,
      kind: 'page',
      source,
      rotation: 0,
    })),
    selected: [],
    anchor: null,
    past: [],
    future: [],
    nextId: 0,
    sourcePageCount: pageCount,
  };
}

/** True when the plan would produce exactly the document that is open. */
export function isUnchanged(state: OrganizerState): boolean {
  return (
    state.pages.length === state.sourcePageCount &&
    state.pages.every((page, index) => page.kind === 'page' && page.source === index && page.rotation === 0)
  );
}

/** What `organizePdf` needs: the plan without the organizer's bookkeeping. */
export function toOrganizedPages(pages: PlanPage[]): OrganizedPage[] {
  return pages.map((page) =>
    page.kind === 'page'
      ? { kind: 'page', source: page.source, rotation: page.rotation }
      : { kind: 'blank', width: page.width, height: page.height },
  );
}

function isSelected(state: OrganizerState, id: string): boolean {
  return state.selected.includes(id);
}

/** Selected ids in the order the pages appear, which is the order a move keeps. */
function selectedInOrder(state: OrganizerState): string[] {
  return state.pages.filter((page) => isSelected(state, page.id)).map((page) => page.id);
}

/** Records the current page list as a step that can be taken back. */
function commit(state: OrganizerState, pages: PlanPage[], changes: Partial<OrganizerState> = {}): OrganizerState {
  if (pages === state.pages) return { ...state, ...changes };
  const past = [...state.past, state.pages].slice(-HISTORY_LIMIT);
  return { ...state, ...changes, pages, past, future: [] };
}

/**
 * Moves every selected page, keeping their relative order, so the first of them
 * lands at `to` — an index into the list as it looks with the selection taken
 * out. That is what a drop between two pages means: "here", counted among the
 * pages that are staying put.
 */
function moveSelected(state: OrganizerState, to: number): OrganizerState {
  const moving = state.pages.filter((page) => isSelected(state, page.id));
  if (moving.length === 0) return state;
  const staying = state.pages.filter((page) => !isSelected(state, page.id));
  const at = Math.max(0, Math.min(Math.trunc(to), staying.length));
  const pages = [...staying.slice(0, at), ...moving, ...staying.slice(at)];
  if (pages.every((page, index) => page === state.pages[index])) return state;
  return commit(state, pages);
}

/** Where the selection's first page sits among the pages that are not selected. */
function selectionSlot(state: OrganizerState): number {
  let slot = 0;
  for (const page of state.pages) {
    if (isSelected(state, page.id)) return slot;
    slot += 1;
  }
  return slot;
}

function rotate(turn: QuarterTurn, by: 90 | 270): QuarterTurn {
  return ((turn + by) % 360) as QuarterTurn;
}

export function organizerReducer(state: OrganizerState, action: OrganizerAction): OrganizerState {
  switch (action.type) {
    case 'load':
      // A second answer — the engine re-reporting the same document — must not
      // throw away an arrangement already made.
      if (state.sourcePageCount !== 0 || action.pageCount <= 0) return state;
      return initialPlan(action.pageCount);
    case 'select': {
      if (!state.pages.some((page) => page.id === action.id)) return state;
      if (action.mode === 'replace') return { ...state, selected: [action.id], anchor: action.id };
      if (action.mode === 'toggle') {
        const selected = isSelected(state, action.id)
          ? state.selected.filter((id) => id !== action.id)
          : [...state.selected, action.id];
        return { ...state, selected, anchor: action.id };
      }
      const anchorIndex = state.pages.findIndex((page) => page.id === state.anchor);
      const targetIndex = state.pages.findIndex((page) => page.id === action.id);
      if (anchorIndex === -1) return { ...state, selected: [action.id], anchor: action.id };
      const [from, to] = anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
      return { ...state, selected: state.pages.slice(from, to + 1).map((page) => page.id) };
    }
    case 'select-all':
      return { ...state, selected: state.pages.map((page) => page.id), anchor: state.pages[0]?.id ?? null };
    case 'clear-selection':
      return { ...state, selected: [], anchor: null };
    case 'move-selected':
      return moveSelected(state, action.to);
    case 'shift-selected': {
      if (state.selected.length === 0) return state;
      return moveSelected(state, selectionSlot(state) + action.by);
    }
    case 'duplicate-selected': {
      const order = selectedInOrder(state);
      if (order.length === 0) return state;
      // Each copy goes straight after the last selected page, as a block in the
      // same order, and becomes the selection — so "duplicate, then move" moves
      // the copies, which is what someone duplicating in order to move means.
      let nextId = state.nextId;
      const copies = state.pages
        .filter((page) => isSelected(state, page.id))
        .map((page) => ({ ...page, id: `c${nextId++}` }));
      const lastIndex = state.pages.findIndex((page) => page.id === order[order.length - 1]);
      const pages = [...state.pages.slice(0, lastIndex + 1), ...copies, ...state.pages.slice(lastIndex + 1)];
      return commit(state, pages, {
        selected: copies.map((page) => page.id),
        anchor: copies[0]!.id,
        nextId,
      });
    }
    case 'delete-selected': {
      const pages = state.pages.filter((page) => !isSelected(state, page.id));
      // A PDF has at least one page. Refusing here rather than at save time means
      // the button that would do it is disabled, instead of an error arriving later.
      if (pages.length === 0 || pages.length === state.pages.length) return state;
      return commit(state, pages, { selected: [], anchor: null });
    }
    case 'rotate-selected': {
      if (state.selected.length === 0) return state;
      const pages = state.pages.map((page) =>
        isSelected(state, page.id) && page.kind === 'page'
          ? { ...page, rotation: rotate(page.rotation, action.by) }
          : page,
      );
      if (pages.every((page, index) => page === state.pages[index])) return state;
      return commit(state, pages);
    }
    case 'insert-blank': {
      if (!(action.width > 0 && action.height > 0)) return state;
      // After the selection, or at the end when nothing is selected: the two
      // places someone adding a page is looking.
      const order = selectedInOrder(state);
      const at = order.length === 0
        ? state.pages.length
        : state.pages.findIndex((page) => page.id === order[order.length - 1]) + 1;
      const blank: PlanPage = { id: `b${state.nextId}`, kind: 'blank', width: action.width, height: action.height };
      const pages = [...state.pages.slice(0, at), blank, ...state.pages.slice(at)];
      return commit(state, pages, { selected: [blank.id], anchor: blank.id, nextId: state.nextId + 1 });
    }
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        pages: previous,
        past: state.past.slice(0, -1),
        future: [state.pages, ...state.future],
        selected: state.selected.filter((id) => previous.some((page) => page.id === id)),
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        pages: next,
        past: [...state.past, state.pages],
        future: state.future.slice(1),
        selected: state.selected.filter((id) => next.some((page) => page.id === id)),
      };
    }
  }
}

/** The size a blank page should take: that of the page it follows, or the first page. */
export function blankSizeFor(
  state: OrganizerState,
  sizeOf: (source: number) => { width: number; height: number } | undefined,
): { width: number; height: number } {
  const order = selectedInOrder(state);
  const anchorId = order[order.length - 1] ?? state.pages[state.pages.length - 1]?.id;
  const neighbour = state.pages.find((page) => page.id === anchorId);
  if (neighbour?.kind === 'blank') return { width: neighbour.width, height: neighbour.height };
  if (neighbour?.kind === 'page') {
    const size = sizeOf(neighbour.source);
    if (size) {
      // A page turned a quarter is seen landscape; a blank page after it should be too.
      return neighbour.rotation % 180 === 0 ? size : { width: size.height, height: size.width };
    }
  }
  // US Letter, the size pdf-lib itself defaults to.
  return { width: 612, height: 792 };
}
