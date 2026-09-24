import { describe, expect, it } from 'vitest';

import { MAX_SYSTEM_PATH_LENGTH, REFUSED_SYSTEM_PATH, safeSystemPath } from './deep-link';

describe('incoming link screening', () => {
  it('passes a well-formed link through unchanged', () => {
    for (const path of [
      'iroha-pdf:///',
      'iroha-pdf://viewer/42',
      'iroha-pdf://note/7?title=%E3%83%A1%E3%83%A2&from=viewer',
      '/viewer/42?page=3',
    ]) {
      expect(safeSystemPath(path)).toBe(path);
    }
  });

  it('refuses a link the router would decode on the slow path', () => {
    // A lone `%` and a truncated UTF-8 sequence are both what makes
    // decodeURIComponent throw, which is the only way into the fallback.
    expect(safeSystemPath('iroha-pdf://viewer/42?q=%')).toBe(REFUSED_SYSTEM_PATH);
    expect(safeSystemPath('iroha-pdf://viewer/42?q=%E3%83')).toBe(REFUSED_SYSTEM_PATH);
    expect(safeSystemPath(`iroha-pdf://x?q=${'%C0'.repeat(400)}`)).toBe(REFUSED_SYSTEM_PATH);
  });

  it('refuses a link longer than anything the application routes to', () => {
    const atLimit = `/${'a'.repeat(MAX_SYSTEM_PATH_LENGTH - 1)}`;
    expect(safeSystemPath(atLimit)).toBe(atLimit);
    expect(safeSystemPath(`${atLimit}a`)).toBe(REFUSED_SYSTEM_PATH);
  });

  it('decides a hostile link in linear time', () => {
    const hostile = `iroha-pdf://x?q=${'%E3%83%'.repeat(290)}`;
    const started = performance.now();
    expect(safeSystemPath(hostile)).toBe(REFUSED_SYSTEM_PATH);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
