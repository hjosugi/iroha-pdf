/**
 * Blank-page removal (#30).
 *
 * The detector only lists pages that paint nothing, and the list is a preview: the
 * test removes what the dialog shows and checks the new file, rather than trusting
 * that a button exists.
 */
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

import { boot, openPdf } from './helpers';
import { readVirtualFile } from './tauri-stub';

test.describe('removing blank pages', () => {
  test('removes the pages the preview lists, and only those', async ({ page }) => {
    const openPath = '/virtual/documents/blank-pages.pdf';
    const target = '/virtual/documents/blank-removed.pdf';
    await boot(page, 'blank-pages.pdf', { openPath, savePath: target });
    await openPdf(page);

    await page.getByRole('button', { name: 'Blank pages…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove blank pages' });
    await expect(dialog).toBeVisible();

    // The fixture is text, blank, text, blank.
    await expect(dialog.getByRole('checkbox')).toHaveCount(2);
    await expect(dialog).toContainText('Page 2');
    await expect(dialog).toContainText('Page 4');

    await dialog.getByRole('button', { name: 'Remove 2 pages and save' }).click();
    await expect(page.locator('.save-state')).toContainText('blank-removed.pdf');

    const saved = await readVirtualFile(page, target);
    expect(saved).not.toBeNull();
    const pdf = await PDFDocument.load(new Uint8Array(saved!));
    expect(pdf.getPageCount()).toBe(2);
  });

  test('says so when there is nothing to remove', async ({ page }) => {
    await boot(page, 'form.pdf');
    await openPdf(page);

    await page.getByRole('button', { name: 'Blank pages…' }).click();
    await expect(page.locator('.save-state')).toContainText('No blank pages');
  });
});
