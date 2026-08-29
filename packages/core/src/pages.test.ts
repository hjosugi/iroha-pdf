import { describe, expect, it } from 'vitest';

import { PageSelectionError, parsePageSelection } from './pages';

describe('reading a typed page selection', () => {
  it('reads single pages, ranges and a mixture, one-based', () => {
    expect(parsePageSelection('1')).toEqual([0]);
    expect(parsePageSelection('2, 5')).toEqual([1, 4]);
    expect(parsePageSelection('9-12')).toEqual([8, 9, 10, 11]);
    expect(parsePageSelection(' 2 ,5, 9 - 11 ')).toEqual([1, 4, 8, 9, 10]);
  });

  /**
   * `3,1` means those pages in that order to `reorderPdf`, and naming a page
   * twice is how it gets duplicated. Collapsing here would take both away from
   * every caller to suit the two that do not want them.
   */
  it('keeps the order and the repetition it was given', () => {
    expect(parsePageSelection('3,1')).toEqual([2, 0]);
    expect(parsePageSelection('2,2')).toEqual([1, 1]);
  });

  it('reads a single-page range as that page', () => {
    expect(parsePageSelection('4-4')).toEqual([3]);
  });

  it('refuses a selection that names nothing', () => {
    for (const value of ['', '   ', ',', ' , , ']) {
      expect(() => parsePageSelection(value)).toThrow(PageSelectionError);
      try {
        parsePageSelection(value);
      } catch (error) {
        expect((error as PageSelectionError).problem).toEqual({ reason: 'empty' });
      }
    }
  });

  /**
   * `2e3` and `0x10` are the reason this checks digits rather than asking
   * `Number`: it reads them as pages 2000 and 16, which nobody typed on purpose.
   */
  it('refuses page numbers that are not pages, naming the fragment', () => {
    for (const value of ['0', '-1', '1.5', 'x', '2e3', '0x10', '+2', '1_0']) {
      try {
        parsePageSelection(value);
        throw new Error(`${value} should not have parsed`);
      } catch (error) {
        expect((error as PageSelectionError).problem).toEqual({ reason: 'not-a-page', value });
      }
    }
  });

  it('refuses a range that runs backwards or starts before page one', () => {
    for (const value of ['5-2', '0-3']) {
      try {
        parsePageSelection(value);
        throw new Error(`${value} should not have parsed`);
      } catch (error) {
        expect((error as PageSelectionError).problem).toEqual({ reason: 'not-a-range', value });
      }
    }
  });

  /** The reason and the fragment are what a caller words its own message from. */
  it('carries the offending fragment rather than a pre-worded sentence', () => {
    try {
      parsePageSelection('1, banana, 3');
      throw new Error('should not have parsed');
    } catch (error) {
      expect((error as PageSelectionError).problem).toEqual({ reason: 'not-a-page', value: 'banana' });
    }
  });
});
