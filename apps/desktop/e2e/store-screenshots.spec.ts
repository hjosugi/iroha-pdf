import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { boot, drawShape, firstPage, openPdf } from './helpers';

const OUTPUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../release/store/screenshots/desktop',
);

test.describe('desktop store screenshots', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeAll(async () => {
    await mkdir(OUTPUT_DIR, { recursive: true });
  });

  test('empty local-first workspace', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await expect(page.getByRole('heading', { name: 'Your documents, without the clutter.' })).toBeVisible();
    await page.screenshot({ path: join(OUTPUT_DIR, '01-local-first-workspace.png') });
  });

  test('PDF open with editing tools', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await expect(firstPage(page)).toBeVisible();
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: join(OUTPUT_DIR, '02-pdf-editing.png') });
  });

  test('annotation ready to save', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await expect(firstPage(page)).toBeVisible();
    await drawShape(page);
    await expect(page.getByRole('button', { name: /^Save \(\d+\)$/ })).toBeVisible();
    await page.screenshot({ path: join(OUTPUT_DIR, '03-annotation-ready-to-save.png') });
  });
});
