/**
 * Language.
 *
 * This is a Japanese-first product whose interface was English-only. These
 * check the thing that actually matters to a user: that a machine set to
 * Japanese gets Japanese, that a machine set to anything else still gets a
 * usable interface, and that the two really differ rather than the catalogue
 * having been filled in on one side only.
 *
 * `boot` is not used here. It waits for the button labelled "Open PDF", which
 * is exactly the string under test — it would fail before an assertion ran.
 * These only need the app to load and never open anything, so the stub is
 * seeded empty and the open dialog is told to report a cancelled selection.
 */
import { expect, test } from '@playwright/test';

import { installTauriStub } from './tauri-stub';

test.describe('a machine set to Japanese', () => {
  test.use({ locale: 'ja-JP' });

  test('gets a Japanese interface', async ({ page }) => {
    await installTauriStub(page, { files: {}, openPath: null, savePath: null });
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '散らからない、あなたの書類。' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'PDFを開く' }).first()).toBeVisible();

    // The tagline and the button are the whole empty state, so either one left
    // in English would make the screen mixed — worse than untranslated.
    await expect(page.getByText('Your documents, without the clutter.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open PDF', exact: true })).toHaveCount(0);
  });

  test('declares the language to the browser, not only to the reader', async ({ page }) => {
    await installTauriStub(page, { files: {}, openPath: null, savePath: null });
    await page.goto('/');

    // Screen readers, hyphenation and CJK font fallback all key off this.
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  });
});

test.describe('a machine set to a language this product does not ship', () => {
  test.use({ locale: 'fr-FR' });

  test('falls back to English rather than to nothing', async ({ page }) => {
    await installTauriStub(page, { files: {}, openPath: null, savePath: null });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Your documents, without the clutter.' }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
