/**
 * Reading a page selection a person typed.
 *
 * `2, 5, 9-12` is how someone says which pages they mean, and both applications
 * need the same reading of it — this lived only in the mobile Tools screen, so
 * desktop would have had to grow a second one, and two parsers of the same
 * syntax disagree eventually.
 *
 * What is deliberately not here is the wording. Core has no locale: the message
 * catalogue is looked up per platform, so a failure is reported as what went
 * wrong and with which fragment, and each caller says it in its own words. That
 * also keeps the fragment out of a string this module would have had to
 * interpolate blind.
 */

export type PageSelectionProblem =
  | { reason: 'empty' }
  | { reason: 'not-a-page'; value: string }
  | { reason: 'not-a-range'; value: string };

export class PageSelectionError extends Error {
  constructor(readonly problem: PageSelectionProblem) {
    super(`Unusable page selection: ${JSON.stringify(problem)}`);
    this.name = 'PageSelectionError';
  }
}

const RANGE = /^(\d+)\s*-\s*(\d+)$/;

/**
 * Digits and nothing else. The range branch already demanded them; the
 * single-page branch handed the fragment to `Number`, which reads `2e3` as page
 * 2000 and `0x10` as page 16 — neither of which anyone typed on purpose, and
 * both of which then reached the document as a real page number.
 */
const PAGE = /^\d+$/;

/**
 * Turns `2, 5, 9-12` into zero-based page indices.
 *
 * Order and repetition are kept rather than collapsed: `3,1` means those pages in
 * that order to `reorderPdf`, and naming a page twice is how it gets duplicated.
 * The operations that must not repeat a page — remove, rotate — collapse their
 * own input, which is theirs to decide and not this function's.
 *
 * Only the lower bound is checked. How many pages the document has is not known
 * here, and guessing it would move the upper-bound refusal away from
 * `assertPageIndex`, which words it once for every operation.
 */
export function parsePageSelection(value: string): number[] {
  const pages: number[] = [];

  for (const part of value.split(',').map((item) => item.trim()).filter(Boolean)) {
    const range = RANGE.exec(part);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < start) throw new PageSelectionError({ reason: 'not-a-range', value: part });
      for (let page = start; page <= end; page += 1) pages.push(page - 1);
      continue;
    }
    const page = PAGE.test(part) ? Number(part) : Number.NaN;
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new PageSelectionError({ reason: 'not-a-page', value: part });
    }
    pages.push(page - 1);
  }

  if (pages.length === 0) throw new PageSelectionError({ reason: 'empty' });
  return pages;
}
