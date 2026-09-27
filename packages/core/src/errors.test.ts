import { describe, expect, it } from 'vitest';

import { classifyError, isTechnicalMessage, userFacingErrorMessage } from './errors';
import { createTranslator } from './i18n';

const en = createTranslator('en');
const ja = createTranslator('ja');

describe('classifyError', () => {
  it.each([
    ['disk is full', new Error('SQLITE_FULL: database or disk is full'), 'storage-full'],
    ['no space', new Error('ENOSPC: no space left on device'), 'storage-full'],
    ['locked', new Error('SQLITE_BUSY: database is locked'), 'busy'],
    ['corrupt', new Error('Invalid PDF structure'), 'corrupt-file'],
    ['permission', new Error('EACCES: permission denied, open /x/y.pdf'), 'permission'],
    ['not found', new Error('ENOENT: no such file or directory'), 'not-found'],
    ['network', new Error('Network request failed'), 'network'],
    ['auth', Object.assign(new Error('Request failed'), { code: '401' }), 'auth'],
    ['cancelled', new Error('The operation was cancelled'), 'cancelled'],
    ['unsupported', new Error('Unsupported PDF feature'), 'unsupported'],
    ['unknown', new Error('Something odd happened'), 'unknown'],
  ])('reads %s', (_label, error, kind) => {
    expect(classifyError(error)).toBe(kind);
  });
});

describe('isTechnicalMessage', () => {
  it.each([
    'ENOENT: no such file or directory, open /data/user/0/app/files/x.pdf',
    'Error: boom\n    at doThing (app://index.js:10:5)',
    'Task rejected: {"code":14,"message":"Document doc-123 not found"}',
    'TypeError: undefined is not an object',
    'Could not load https://example.test/api',
  ])('rejects %s', (message) => {
    expect(isTechnicalMessage(message)).toBe(true);
  });

  it('accepts ordinary app wording', () => {
    expect(isTechnicalMessage('There is not enough free space. Free some space and try again.')).toBe(false);
    expect(isTechnicalMessage('The library could not be read')).toBe(false);
  });
});

describe('userFacingErrorMessage', () => {
  it('localizes a classified platform error', () => {
    expect(userFacingErrorMessage(new Error('ENOSPC: no space left on device'), en))
      .toBe('There is not enough free space. Free some space and try again.');
    expect(userFacingErrorMessage(new Error('ENOSPC: no space left on device'), ja))
      .toBe('端末の空き容量が足りません。不要なファイルを削除してから、もう一度お試しください。');
  });

  it('passes through the app\u2019s own, non-technical wording', () => {
    expect(userFacingErrorMessage(new Error('Enter at least one page'), en)).toBe('Enter at least one page');
  });

  it('never shows an unclassified technical message', () => {
    const raw = 'Weird failure at run (bundle.js:1:2)';
    const shown = userFacingErrorMessage(new Error(raw), en);
    expect(shown).toBe('Something went wrong. Please try again.');
    expect(shown).not.toContain('bundle.js');
  });

  it('handles a non-Error rejection', () => {
    expect(userFacingErrorMessage('Network request failed', en))
      .toBe('Could not reach the network. Check your connection and try again.');
    expect(userFacingErrorMessage(undefined, en)).toBe('Something went wrong. Please try again.');
  });
});
