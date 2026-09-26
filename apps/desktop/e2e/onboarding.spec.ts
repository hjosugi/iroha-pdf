/**
 * The first-run introduction (#65) on the desktop: what it says, the sample it
 * opens, and that Skip is remembered.
 *
 * The sample is registered with no path, so the checks that matter most are the
 * ones about saving it: Save must ask where, and must not write anywhere it was
 * not told to.
 */
import { expect, test, type Page } from '@playwright/test';

import { boot, nextSavePath } from './helpers';
import { listVirtualFiles, readVirtualFile } from './tauri-stub';

const SAVED = '/virtual/documents/my-practice.pdf';

function welcome(page: Page) {
  return page.getByRole('region', { name: 'Welcome to Iroha PDF' });
}

test.describe('first run', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page, 'complex.pdf');
  });

  test('says where files live and what Save does, next to the usual way in', async ({ page }) => {
    await expect(welcome(page)).toBeVisible();
    await expect(welcome(page)).toContainText('kept on this device');
    await expect(welcome(page)).toContainText('iroha-original.pdf');
    // The desktop has no Google Drive, so the introduction does not describe one.
    await expect(welcome(page)).not.toContainText('drive.file');
    // Opening a PDF of one's own is still the first thing on the screen.
    await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible();
  });

  test('opens the sample, and saving it asks where rather than writing anywhere', async ({ page }) => {
    const before = await listVirtualFiles(page);
    await welcome(page).getByRole('button', { name: 'Try the sample PDF' }).click();

    await expect(page.getByRole('tab', { name: 'Iroha PDF sample.pdf' })).toBeVisible();
    await expect(page.locator('.pdf-viewport img').first()).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);

    await nextSavePath(page, SAVED);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.locator('.save-state')).toContainText('my-practice.pdf');

    const saved = await readVirtualFile(page, SAVED);
    expect(saved?.subarray(0, 5).toString()).toBe('%PDF-');
    // The practice document went where it was told, and nowhere else.
    const after = await listVirtualFiles(page);
    expect(after.filter((path) => !before.includes(path))).toEqual([SAVED]);
  });

  test('stays skipped', async ({ page }) => {
    await welcome(page).getByRole('button', { name: 'Skip' }).click();
    await expect(welcome(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Your documents, without the clutter.' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
  });
});
