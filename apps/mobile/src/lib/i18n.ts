import { createTranslator, resolveLocale } from '@iroha-pdf/core';

/**
 * Hermes exposes the device locale through Intl without another native module.
 * Keeping locale selection here also makes every mobile screen use the same
 * fallback rule as desktop: Japanese when the device asks for it, English for
 * every unsupported language.
 */
export const locale = resolveLocale([
  Intl.DateTimeFormat().resolvedOptions().locale,
]);

export const t = createTranslator(locale);
