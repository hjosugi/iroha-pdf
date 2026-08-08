import { describe, expect, it } from 'vitest';

import type { HighlightAnnotation } from '@iroha-pdf/core';

import {
  EMPTY_HISTORY,
  MAX_HISTORY_STEPS,
  planRedo,
  planUndo,
  recordCreate,
  recordDelete,
  redoRestores,
  undoRestores,
} from './annotation-history';

function mark(id: string): HighlightAnnotation {
  return {
    id,
    documentId: 'doc-1',
    pageIndex: 0,
    color: '#FFDD55',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    kind: 'highlight',
    position: { x: 0.1, y: 0.2 },
    width: 0.25,
    height: 0.035,
    opacity: 0.42,
  };
}

describe('annotation history', () => {
  it('has nothing to take back to begin with', () => {
    expect(planUndo(EMPTY_HISTORY)).toBeNull();
    expect(planRedo(EMPTY_HISTORY)).toBeNull();
  });

  it('takes back a mark that was drawn by removing it', () => {
    const history = recordCreate(EMPTY_HISTORY, mark('a'));
    const undo = planUndo(history);

    expect(undo?.step.annotation.id).toBe('a');
    expect(undoRestores(undo!.step), 'undoing a creation removes the mark').toBe(false);
    expect(planUndo(undo!.next), 'and there is nothing left to take back').toBeNull();
  });

  /** The gap this module was extracted to close: erasing used to be permanent. */
  it('takes back an erase by putting the mark back', () => {
    const history = recordDelete(EMPTY_HISTORY, mark('a'));
    const undo = planUndo(history);

    expect(undo?.step.annotation.id).toBe('a');
    expect(undoRestores(undo!.step), 'undoing a deletion restores the mark').toBe(true);
  });

  it('redoes a creation by drawing it again, and a deletion by erasing again', () => {
    const created = planUndo(recordCreate(EMPTY_HISTORY, mark('a')))!.next;
    const erased = planUndo(recordDelete(EMPTY_HISTORY, mark('b')))!.next;

    expect(redoRestores(planRedo(created)!.step), 'redoing a creation puts it back').toBe(true);
    expect(redoRestores(planRedo(erased)!.step), 'redoing a deletion takes it away').toBe(false);
  });

  it('walks back and forth over several steps in order', () => {
    let history = recordCreate(recordCreate(EMPTY_HISTORY, mark('a')), mark('b'));

    const first = planUndo(history)!;
    expect(first.step.annotation.id, 'the most recent step comes back first').toBe('b');
    const second = planUndo(first.next)!;
    expect(second.step.annotation.id).toBe('a');

    history = second.next;
    expect(planRedo(history)!.step.annotation.id, 'redo replays in the order undone').toBe('a');
    expect(planRedo(planRedo(history)!.next)!.step.annotation.id).toBe('b');
  });

  it('drops the redo stack as soon as something new is done', () => {
    const undone = planUndo(recordCreate(EMPTY_HISTORY, mark('a')))!.next;
    expect(planRedo(undone)).not.toBeNull();

    // The redone future no longer exists: offering it would put back a mark the user
    // has since worked past.
    const afterNewWork = recordCreate(undone, mark('b'));
    expect(planRedo(afterNewWork)).toBeNull();
  });

  it('holds a bounded number of steps rather than every edit of a session', () => {
    let history = EMPTY_HISTORY;
    for (let index = 0; index < MAX_HISTORY_STEPS + 25; index += 1) {
      history = recordCreate(history, mark(`a${index}`));
    }

    expect(history.undo).toHaveLength(MAX_HISTORY_STEPS);
    expect(history.undo[0]?.annotation.id, 'the oldest steps are the ones dropped').toBe('a25');
    expect(planUndo(history)?.step.annotation.id).toBe(`a${MAX_HISTORY_STEPS + 24}`);
  });

  it('does not move the history until the caller says the write landed', () => {
    const history = recordCreate(EMPTY_HISTORY, mark('a'));
    planUndo(history);
    planUndo(history);

    // Planning twice changes nothing: a database write can fail, and a history that
    // moved anyway would describe a document that does not exist.
    expect(history.undo).toHaveLength(1);
    expect(history.redo).toHaveLength(0);
  });
});
