/**
 * What undo and redo mean for annotations.
 *
 * This was inline in the viewer as two arrays of annotations, which encoded an
 * assumption: that every step worth taking back is a creation, so taking it back is a
 * deletion. Erasing therefore could not be undone at all — the tool whose entire
 * purpose is fixing a mistake was the one mistake that stuck.
 *
 * A step is now recorded with what happened to it, so undoing knows whether to remove
 * the mark or put it back. Keeping that here rather than in the screen also makes it
 * testable, which two arrays inside a 700-line component were not.
 */
import type { PdfAnnotation } from '@iroha-pdf/core';

export type HistoryStep =
  | { action: 'create'; annotation: PdfAnnotation }
  | { action: 'delete'; annotation: PdfAnnotation };

export type AnnotationHistory = {
  undo: readonly HistoryStep[];
  redo: readonly HistoryStep[];
};

export const EMPTY_HISTORY: AnnotationHistory = { undo: [], redo: [] };

/**
 * How many steps back one document is worth keeping. Each holds a whole annotation,
 * and an ink stroke carries every point of it, so this is bounded rather than left to
 * grow for as long as a document stays open.
 */
export const MAX_HISTORY_STEPS = 100;

function push(steps: readonly HistoryStep[], step: HistoryStep): readonly HistoryStep[] {
  return [...steps, step].slice(-MAX_HISTORY_STEPS);
}

/**
 * Records a step the user just took.
 *
 * Doing anything new drops the redo stack: those steps described a future that has
 * been replaced, and offering them would put back a mark the user has since worked
 * past.
 */
export function record(history: AnnotationHistory, step: HistoryStep): AnnotationHistory {
  return { undo: push(history.undo, step), redo: [] };
}

export function recordCreate(history: AnnotationHistory, annotation: PdfAnnotation): AnnotationHistory {
  return record(history, { action: 'create', annotation });
}

export function recordDelete(history: AnnotationHistory, annotation: PdfAnnotation): AnnotationHistory {
  return record(history, { action: 'delete', annotation });
}

/**
 * The step to take back and the history that results — but only once the caller has
 * actually taken it back, which is why the two are returned rather than applied. A
 * write to the database can fail, and a history that moved anyway would be describing
 * a document that does not exist.
 */
export function planUndo(
  history: AnnotationHistory,
): { step: HistoryStep; next: AnnotationHistory } | null {
  const step = history.undo.at(-1);
  if (!step) return null;
  return {
    step,
    next: { undo: history.undo.slice(0, -1), redo: push(history.redo, step) },
  };
}

export function planRedo(
  history: AnnotationHistory,
): { step: HistoryStep; next: AnnotationHistory } | null {
  const step = history.redo.at(-1);
  if (!step) return null;
  return {
    step,
    next: { undo: push(history.undo, step), redo: history.redo.slice(0, -1) },
  };
}

/** Whether taking `step` back means putting the annotation back, or removing it. */
export function undoRestores(step: HistoryStep): boolean {
  return step.action === 'delete';
}

/** Whether redoing `step` means putting the annotation back, or removing it again. */
export function redoRestores(step: HistoryStep): boolean {
  return step.action === 'create';
}
