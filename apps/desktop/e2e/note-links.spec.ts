/**
 * Linking a note to a place in the PDF (#46).
 *
 * The selection comes from the real viewer in pointer mode, the link is written
 * into the note as Markdown, and the jump reads that Markdown back.
 */
import { expect, test } from '@playwright/test';

import { boot, dragOn, openPdf } from './helpers';

/** The title line near the top of complex.pdf, as fractions of the rendered page. */
const TITLE_LINE = { x1: 0.1, y1: 0.088, x2: 0.45, y2: 0.088 };

async function openNoteTab(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('tab', { name: 'Note' }).click();
  await expect(page.locator('.note-body')).toBeVisible();
}

test('turns a text selection into a Markdown link and jumps back to it', async ({ page }) => {
  await boot(page, 'complex.pdf');
  await openPdf(page);
  await openNoteTab(page);

  await dragOn(page, TITLE_LINE);
  const linkButton = page.getByRole('button', { name: 'Link selection' });
  await expect(linkButton).toBeVisible();
  await linkButton.click();

  await expect(page.locator('.note-body')).toHaveValue(/iroha-pdf:\/\/note-target\?/);
  const jump = page.locator('.note-link').first();
  await expect(jump).toBeVisible();

  await jump.click();
  await expect(
    page.locator('.saved-indicator').filter({ hasText: 'Jumped to page' }),
  ).toBeVisible();
});

test('keeps the link in the note across a tab switch', async ({ page }) => {
  await boot(page, 'complex.pdf');
  await openPdf(page);
  await openNoteTab(page);

  await dragOn(page, TITLE_LINE);
  await page.getByRole('button', { name: 'Link selection' }).click();
  await expect(page.locator('.note-link').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Edit history' }).click();
  await openNoteTab(page);

  await expect(page.locator('.note-body')).toHaveValue(/iroha-pdf:\/\/note-target\?/);
  await expect(page.locator('.note-link').first()).toBeVisible();
});
