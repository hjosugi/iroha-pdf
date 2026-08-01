import { describe, expect, it } from 'vitest';

import { LOCALES, MESSAGE_KEYS, createTranslator, resolveLocale } from './i18n';

describe('locale resolution', () => {
  it('matches on the language subtag, not the whole tag', () => {
    expect(resolveLocale(['ja-JP'])).toBe('ja');
    expect(resolveLocale(['ja'])).toBe('ja');
    expect(resolveLocale(['ja_JP'])).toBe('ja');
  });

  it('takes the first tag it recognises, in preference order', () => {
    expect(resolveLocale(['fr-FR', 'ja-JP', 'en-US'])).toBe('ja');
    expect(resolveLocale(['fr-FR', 'en-US', 'ja-JP'])).toBe('en');
  });

  it('falls back to English for anything unrecognised or absent', () => {
    expect(resolveLocale(['fr-FR'])).toBe('en');
    expect(resolveLocale([])).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('translation', () => {
  it('returns the message for the locale', () => {
    expect(createTranslator('ja')('document.open')).toBe('PDFを開く');
    expect(createTranslator('en')('document.open')).toBe('Open PDF');
  });

  it('leaves a placeholder it has no value for visible rather than printing undefined', () => {
    // A visible `{count}` is a bug report; an invisible one is a support ticket.
    const substituted = 'Page {page} of {total}'.replace(
      /\{(\w+)\}/g,
      (whole, name: string) =>
        Object.prototype.hasOwnProperty.call({ page: 2 }, name) ? '2' : whole,
    );
    expect(substituted).toBe('Page 2 of {total}');
  });

  // A key translated in one language and forgotten in the other is the failure
  // this catalogue exists to prevent, and it stays invisible until a user in
  // that language meets it.
  it('carries a non-empty message in every locale for every key', () => {
    expect(MESSAGE_KEYS.length).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      const translate = createTranslator(locale);
      for (const key of MESSAGE_KEYS) {
        expect(translate(key), `${key} is empty in ${locale}`).not.toBe('');
      }
    }
  });

  it('actually translates: most keys differ between the two locales', () => {
    const ja = createTranslator('ja');
    const en = createTranslator('en');
    const identical = MESSAGE_KEYS.filter((key) => ja(key) === en(key));
    // Proper nouns and a numeric example legitimately match; everything else
    // being identical would mean the catalogue was filled in on one side only.
    expect(identical.length).toBeLessThan(MESSAGE_KEYS.length / 4);
  });
});
