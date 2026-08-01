import { createTranslator, resolveLocale, type Locale, type Translate } from '@iroha-pdf/core';

/**
 * The locale is read once at module load and never changes for the life of the
 * window. Switching language is an operating-system preference, and both the
 * Tauri webview and a browser reload when it changes, so a React context that
 * could re-render on a value that cannot move would be machinery for nothing.
 */
export const locale: Locale = resolveLocale(
  typeof navigator === 'undefined' ? undefined : navigator.languages ?? [navigator.language],
);

export const t: Translate = createTranslator(locale);

/**
 * Set on <html> so the browser hyphenates, selects fonts and reads the page in
 * the right language. Screen readers use this; so does the CJK font fallback.
 */
if (typeof document !== 'undefined') document.documentElement.lang = locale;
