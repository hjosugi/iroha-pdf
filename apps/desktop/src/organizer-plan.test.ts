import { describe, expect, it } from 'vitest';

import {
  blankSizeFor,
  HISTORY_LIMIT,
  initialPlan,
  isUnchanged,
  organizerReducer,
  toOrganizedPages,
  type OrganizerAction,
  type OrganizerState,
} from './organizer-plan';

function run(state: OrganizerState, ...actions: OrganizerAction[]): OrganizerState {
  return actions.reduce(organizerReducer, state);
}

/** The plan as page numbers, one-based, with a turn written after an `@` and blanks as `_`. */
function pages(state: OrganizerState): string[] {
  return state.pages.map((page) =>
    page.kind === 'blank' ? '_' : `${page.source + 1}${page.rotation ? `@${page.rotation}` : ''}`,
  );
}

function selectedPages(state: OrganizerState): string[] {
  return state.pages
    .filter((page) => state.selected.includes(page.id))
    .map((page) => (page.kind === 'blank' ? '_' : String(page.source + 1)));
}

const select = (id: string, mode: 'replace' | 'toggle' | 'range' = 'replace'): OrganizerAction => ({
  type: 'select',
  id,
  mode,
});

describe('starting a plan', () => {
  it('starts from the page count once, and ignores a later report', () => {
    const loaded = run(initialPlan(0), { type: 'load', pageCount: 3 });
    expect(pages(loaded)).toEqual(['1', '2', '3']);

    const arranged = run(loaded, select('p0'), { type: 'move-selected', to: 2 });
    expect(run(arranged, { type: 'load', pageCount: 3 })).toBe(arranged);
    expect(run(initialPlan(0), { type: 'load', pageCount: 0 }).pages).toEqual([]);
  });
});

describe('selection', () => {
  it('replaces, toggles and extends by range from the last page clicked', () => {
    const state = run(initialPlan(6), select('p1'), select('p3', 'toggle'), select('p5', 'range'));

    expect(selectedPages(state)).toEqual(['4', '5', '6']);
    expect(selectedPages(run(state, select('p4', 'toggle')))).toEqual(['4', '6']);
    expect(selectedPages(run(state, select('p0')))).toEqual(['1']);
  });

  it('selects all and clears, without either being a step to undo', () => {
    const all = run(initialPlan(3), { type: 'select-all' });
    expect(selectedPages(all)).toEqual(['1', '2', '3']);
    expect(run(all, { type: 'clear-selection' }).selected).toEqual([]);
    expect(all.past).toHaveLength(0);
  });

  it('ignores a page that is not in the plan', () => {
    const state = initialPlan(2);
    expect(run(state, select('p9'))).toBe(state);
  });
});

describe('moving pages', () => {
  it('drops a page between two others', () => {
    const state = run(initialPlan(5), select('p0'), { type: 'move-selected', to: 2 });
    expect(pages(state)).toEqual(['2', '3', '1', '4', '5']);
    expect(selectedPages(state)).toEqual(['1']);
  });

  it('moves a scattered selection as one block, keeping its order', () => {
    const state = run(
      initialPlan(6),
      select('p4'),
      select('p1', 'toggle'),
      { type: 'move-selected', to: 0 },
    );
    expect(pages(state)).toEqual(['2', '5', '1', '3', '4', '6']);
  });

  it('clamps a drop past either end', () => {
    expect(pages(run(initialPlan(3), select('p0'), { type: 'move-selected', to: 99 }))).toEqual(['2', '3', '1']);
    expect(pages(run(initialPlan(3), select('p2'), { type: 'move-selected', to: -4 }))).toEqual(['3', '1', '2']);
  });

  it('shifts the selection one place at a time from the keyboard', () => {
    let state = run(initialPlan(4), select('p1'), { type: 'shift-selected', by: 1 });
    expect(pages(state)).toEqual(['1', '3', '2', '4']);
    state = run(state, { type: 'shift-selected', by: -1 }, { type: 'shift-selected', by: -1 });
    expect(pages(state)).toEqual(['2', '1', '3', '4']);
  });

  it('records nothing when a move changes nothing', () => {
    const state = run(initialPlan(3), select('p0'));
    expect(run(state, { type: 'move-selected', to: 0 })).toBe(state);
    expect(run(state, { type: 'shift-selected', by: -1 })).toBe(state);
    expect(run(initialPlan(3), { type: 'move-selected', to: 1 }).past).toHaveLength(0);
  });
});

describe('duplicate, delete, rotate and insert', () => {
  it('puts copies straight after the selection and selects the copies', () => {
    const state = run(initialPlan(4), select('p0'), select('p2', 'toggle'), { type: 'duplicate-selected' });
    expect(pages(state)).toEqual(['1', '2', '3', '1', '3', '4']);
    expect(selectedPages(state)).toEqual(['1', '3']);
    // The copies are selected, not the originals: they sit at positions 4 and 5.
    expect(state.selected.every((id) => id.startsWith('c'))).toBe(true);
  });

  it('turns a copy independently of the page it came from', () => {
    const state = run(
      initialPlan(2),
      select('p0'),
      { type: 'duplicate-selected' },
      { type: 'rotate-selected', by: 90 },
    );
    expect(pages(state)).toEqual(['1', '1@90', '2']);
  });

  it('rotates either way, round to where it started', () => {
    const state = run(initialPlan(2), select('p1'), { type: 'rotate-selected', by: 270 });
    expect(pages(state)).toEqual(['1', '2@270']);
    const back = run(state, { type: 'rotate-selected', by: 90 });
    expect(pages(back)).toEqual(['1', '2']);
  });

  it('deletes the selection but never the last page', () => {
    const state = run(initialPlan(3), select('p0'), select('p1', 'toggle'), { type: 'delete-selected' });
    expect(pages(state)).toEqual(['3']);
    expect(state.selected).toEqual([]);

    const all = run(initialPlan(3), { type: 'select-all' });
    expect(run(all, { type: 'delete-selected' })).toBe(all);
  });

  it('inserts a blank page after the selection, or at the end', () => {
    const afterSecond = run(initialPlan(3), select('p1'), { type: 'insert-blank', width: 100, height: 200 });
    expect(pages(afterSecond)).toEqual(['1', '2', '_', '3']);
    expect(selectedPages(afterSecond)).toEqual(['_']);

    const atEnd = run(initialPlan(2), { type: 'insert-blank', width: 100, height: 200 });
    expect(pages(atEnd)).toEqual(['1', '2', '_']);
    expect(run(initialPlan(2), { type: 'insert-blank', width: 0, height: 200 }).pages).toHaveLength(2);
  });

  it('sizes a blank page like the page it follows, turned the way that page is seen', () => {
    const sizes = [{ width: 595, height: 842 }, { width: 300, height: 100 }];
    const sizeOf = (source: number) => sizes[source];

    expect(blankSizeFor(run(initialPlan(2), select('p0')), sizeOf)).toEqual({ width: 595, height: 842 });
    expect(blankSizeFor(initialPlan(2), sizeOf)).toEqual({ width: 300, height: 100 });
    const turned = run(initialPlan(2), select('p0'), { type: 'rotate-selected', by: 90 });
    expect(blankSizeFor(turned, sizeOf)).toEqual({ width: 842, height: 595 });
    expect(blankSizeFor(initialPlan(1), () => undefined)).toEqual({ width: 612, height: 792 });
  });
});

describe('undo and redo', () => {
  it('takes back each step in turn, and puts them back', () => {
    const edited = run(
      initialPlan(3),
      select('p0'),
      { type: 'move-selected', to: 2 },
      { type: 'duplicate-selected' },
      { type: 'delete-selected' },
    );
    expect(pages(edited)).toEqual(['2', '3', '1']);

    const once = run(edited, { type: 'undo' });
    expect(pages(once)).toEqual(['2', '3', '1', '1']);
    const twice = run(once, { type: 'undo' });
    expect(pages(twice)).toEqual(['2', '3', '1']);
    const all = run(twice, { type: 'undo' });
    expect(pages(all)).toEqual(['1', '2', '3']);
    expect(run(all, { type: 'undo' })).toBe(all);

    const redone = run(all, { type: 'redo' }, { type: 'redo' });
    expect(pages(redone)).toEqual(['2', '3', '1', '1']);
  });

  it('drops the redo steps once something new is done', () => {
    const state = run(
      initialPlan(3),
      select('p0'),
      { type: 'move-selected', to: 2 },
      { type: 'undo' },
      { type: 'rotate-selected', by: 90 },
    );
    expect(state.future).toHaveLength(0);
    expect(run(state, { type: 'redo' })).toBe(state);
  });

  it('keeps only the selection that still exists after an undo', () => {
    const state = run(initialPlan(2), select('p0'), { type: 'duplicate-selected' }, { type: 'undo' });
    expect(pages(state)).toEqual(['1', '2']);
    expect(state.selected).toEqual([]);
  });

  it('bounds how many steps it holds', () => {
    let state = run(initialPlan(2), select('p0'));
    for (let step = 0; step < HISTORY_LIMIT + 20; step++) state = run(state, { type: 'rotate-selected', by: 90 });
    expect(state.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('what gets saved', () => {
  it('knows when the plan is the open document exactly', () => {
    const state = initialPlan(3);
    expect(isUnchanged(state)).toBe(true);
    const moved = run(state, select('p0'), { type: 'move-selected', to: 1 });
    expect(isUnchanged(moved)).toBe(false);
    expect(isUnchanged(run(moved, { type: 'undo' }))).toBe(true);
    expect(isUnchanged(run(state, select('p2'), { type: 'delete-selected' }))).toBe(false);
  });

  it('hands core the plan without the bookkeeping', () => {
    const state = run(
      initialPlan(2),
      select('p1'),
      { type: 'rotate-selected', by: 90 },
      { type: 'insert-blank', width: 10, height: 20 },
    );
    expect(toOrganizedPages(state.pages)).toEqual([
      { kind: 'page', source: 0, rotation: 0 },
      { kind: 'page', source: 1, rotation: 90 },
      { kind: 'blank', width: 10, height: 20 },
    ]);
  });
});
