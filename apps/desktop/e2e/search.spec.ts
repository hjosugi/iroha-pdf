/**
 * Searching the open document and its linked note (#45).
 */
import { expect, test } from '@playwright/test';

import { boot, openPdf } from './helpers';

async function openSearch(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('tab', { name: 'Search' }).click();
  await expect(page.locator('.search-input')).toBeVisible();
}

test.describe('search', () => {
  test('finds text in the document and jumps to its page', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openSearch(page);

    await page.locator('.search-input').fill('四半期');
    const hit = page.locator('.search-hit').first();
    await expect(hit).toBeVisible({ timeout: 30_000 });
    await expect(hit).toContainText('Page 1');

    await hit.click();
    await expect(page.locator('[data-page-index="0"]')).toBeVisible();
  });

  test('says when nothing matches', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openSearch(page);

    await page.locator('.search-input').fill('zzzz-not-in-this-document');
    await expect(page.getByText('No matches.')).toBeVisible({ timeout: 30_000 });
  });

  test('searches the linked note as well as the document', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);

    await page.getByRole('tab', { name: 'Note' }).click();
    await page.locator('.note-body').fill('remember clause 4');
    await expect(page.locator('.saved-indicator')).toHaveText('Autosaved locally');

    await openSearch(page);
    await page.locator('.search-input').fill('clause 4');
    const noteHit = page.locator('.search-note-hit').first();
    await expect(noteHit).toBeVisible({ timeout: 30_000 });
    await expect(noteHit).toContainText('clause 4');
  });
});
