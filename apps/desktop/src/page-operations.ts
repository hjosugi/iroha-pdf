/**
 * Merge, split, extract and remove, on the desktop.
 *
 * These have existed in `packages/core` and been tested there since the mobile
 * Tools screen wired them up; desktop had none of them, which is #19's "the
 * desktop half, which is the platform where someone actually assembles
 * documents".
 *
 * Every operation writes a **new** file the user names, and none of them touches
 * the document that is open. That is deliberate rather than incidental: the open
 * document has unsaved annotations, a draft and an edit history keyed to its
 * path, and an operation that rewrote it underneath all three would be a
 * different and much larger feature. Splitting a document you are annotating
 * should not lose the annotations, so it does not touch them.
 */
import {
  extractPdfPages,
  mergePdfs,
  parsePageSelection,
  PageSelectionError,
  removePdfPages,
  splitPdfAt,
} from '@iroha-pdf/core';

import {
  allowSaveSiblings,
  basename,
  pickPdfsFromDisk,
  pickSaveLocation,
  writePdfToDisk,
} from './file-bridge';
import { t } from './i18n';

export type PageOperation = 'extract' | 'remove' | 'split' | 'merge';

export type OperationOutcome =
  | { status: 'written'; paths: string[] }
  | { status: 'cancelled' };

/**
 * A refusal that is already worded for the person who asked — "choose at least
 * two PDFs" rather than something that went wrong.
 *
 * Distinguished from an ordinary Error because the two want opposite handling: an
 * unexpected failure must not put its internals in front of a user, and a
 * deliberate refusal must not be flattened into "that did not finish", which is
 * exactly what happened to `pages.mergeNeedsTwo` before this existed.
 */
export class PageOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageOperationError';
  }
}

/** What to put in front of the user when an operation did not produce a file. */
export function describeOperationFailure(error: unknown): string {
  if (error instanceof PageOperationError) return error.message;
  if (error instanceof PageSelectionError) {
    switch (error.problem.reason) {
      case 'empty':
        return t('pages.enterPage');
      case 'not-a-range':
        return t('pages.invalidRange', { value: error.problem.value });
      case 'not-a-page':
        return t('pages.invalidPage', { value: error.problem.value });
    }
  }
  return t('pages.failed');
}

/** `report.pdf` and `-pages` become `report-pages.pdf`. */
function suggestedName(sourceName: string, suffix: string): string {
  return `${sourceName.replace(/\.pdf$/i, '')}${suffix}.pdf`;
}

/**
 * Asks where to put a produced document and writes it there.
 *
 * The same two steps every save on this platform takes: the dialog grants the
 * chosen path, `allowSaveSiblings` grants the partial file the write assembles
 * itself in, and `writePdfToDisk` only renames it into place once every byte
 * landed.
 */
async function writeProduced(defaultName: string, bytes: Uint8Array): Promise<string | null> {
  const target = await pickSaveLocation(defaultName);
  if (!target) return null;
  await allowSaveSiblings(target);
  await writePdfToDisk(target, bytes.slice().buffer as ArrayBuffer);
  return target;
}

export type OperationRequest = {
  /** The bytes of the document currently open, for everything except merge. */
  source: () => Promise<Uint8Array>;
  sourceName: string;
  /** What the user typed, for the operations that take a page selection. */
  selection: string;
};

/**
 * Runs one operation and reports where its output went.
 *
 * `cancelled` is a real outcome rather than a failure: dismissing the save dialog
 * is how someone changes their mind, and it must not be reported as something
 * going wrong.
 */
export async function runPageOperation(
  operation: PageOperation,
  request: OperationRequest,
): Promise<OperationOutcome> {
  if (operation === 'merge') {
    const picked = await pickPdfsFromDisk();
    if (picked.length === 0) return { status: 'cancelled' };
    if (picked.length < 2) throw new PageOperationError(t('pages.mergeNeedsTwo'));
    const merged = await mergePdfs(picked.map((file) => new Uint8Array(file.buffer)));
    const first = basename(picked[0]!.path);
    const written = await writeProduced(suggestedName(first, '-merged'), merged);
    return written ? { status: 'written', paths: [written] } : { status: 'cancelled' };
  }

  const pages = parsePageSelection(request.selection);
  const bytes = await request.source();

  if (operation === 'split') {
    // The selection names where to cut, so only its first page is meaningful.
    // Reading the whole list and using one of it would silently ignore the rest.
    if (pages.length !== 1) throw new PageOperationError(t('pages.splitOnePage'));
    const [before, after] = await splitPdfAt(bytes, pages[0]!);
    const firstPath = await writeProduced(suggestedName(request.sourceName, '-part1'), before);
    if (!firstPath) return { status: 'cancelled' };
    const secondPath = await writeProduced(suggestedName(request.sourceName, '-part2'), after);
    // The first half is already on disk; saying only that is the honest report.
    return { status: 'written', paths: secondPath ? [firstPath, secondPath] : [firstPath] };
  }

  const produced =
    operation === 'extract' ? await extractPdfPages(bytes, pages) : await removePdfPages(bytes, pages);
  const suffix = operation === 'extract' ? '-pages' : '-trimmed';
  const written = await writeProduced(suggestedName(request.sourceName, suffix), produced);
  return written ? { status: 'written', paths: [written] } : { status: 'cancelled' };
}
