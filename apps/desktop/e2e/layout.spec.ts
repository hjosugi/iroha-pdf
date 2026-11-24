/**
 * Print layouts (#23): two-up, booklet and poster, checked on the produced file.
 */
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

import { boot, openPdf } from './helpers';
import { readVirtualFile } from './tauri-stub';

async function openLayout(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Layout…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Print layout' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function sizes(page: import('@playwright/test').Page, path: string) {
  const saved = await readVirtualFile(page, path);
  expect(saved).not.toBeNull();
  const pdf = await PDFDocument.load(new Uint8Array(saved!));
  return pdf.getPages().map((source) => source.getSize());
}

test.describe('print layouts', () => {
  test('puts two pages on a landscape sheet', async ({ page }) => {
    const target = '/virtual/documents/two-up.pdf';
    await boot(page, 'complex.pdf', { savePath: target });
    await openPdf(page);

    const dialog = await openLayout(page);
    await dialog.getByLabel('2 pages per sheet').check();
    await dialog.getByRole('button', { name: 'Create and save' }).click();
    await expect(page.locator('.save-state')).toContainText('two-up.pdf');

    const pages = await sizes(page, target);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.width).toBeGreaterThan(pages[0]!.height);
  });

  test('orders a booklet for duplex printing', async ({ page }) => {
    const target = '/virtual/documents/booklet.pdf';
    await boot(page, 'complex.pdf', { savePath: target });
    await openPdf(page);

    const dialog = await openLayout(page);
    await dialog.getByLabel('Saddle-stitch booklet (duplex)').check();
    await dialog.getByRole('button', { name: 'Create and save' }).click();
    await expect(page.locator('.save-state')).toContainText('booklet.pdf');

    // Two source pages pad to four, which is one sheet: a front and a back.
    const pages = await sizes(page, target);
    expect(pages).toHaveLength(2);
    for (const size of pages) expect(size.width).toBeGreaterThan(size.height);
  });

  test('splits a poster into one page per tile', async ({ page }) => {
    const target = '/virtual/documents/poster.pdf';
    await boot(page, 'complex.pdf', { savePath: target });
    await openPdf(page);

    const dialog = await openLayout(page);
    await dialog.getByLabel('Poster tiles').check();
    await dialog.getByRole('button', { name: 'Create and save' }).click();
    await expect(page.locator('.save-state')).toContainText('poster.pdf');

    // Two source pages, two by two tiles each.
    const pages = await sizes(page, target);
    expect(pages).toHaveLength(8);
  });
});
