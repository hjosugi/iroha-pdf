/**
 * The first in-place save replaces the file the user opened, which is the one save
 * that destroys something. It is asked about once, before the original is copied
 * aside (#236), and the answer has to be visible wherever the window is.
 */
import { expect, test } from '@playwright/test';

import {
  backupPathFor,
  boot,
  drawShape,
  fillDisk,
  openPdf,
  partPathFor,
  pendingEdits,
  save,
} from './helpers';
import { invokeCalls, readVirtualFile } from './tauri-stub';

const confirmationCount = async (page: import('@playwright/test').Page) =>
  (await invokeCalls(page)).filter((call) => call.cmd === 'plugin:dialog|message').length;

test.describe('overwriting the file that was opened', () => {
  test('asks first, and backing out leaves the document alone', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf', {
      confirmAnswer: 'cancel',
    });
    await openPdf(page);
    await drawShape(page);
    const before = await pendingEdits(page);

    await page.locator('.pdf-toolbar .primary-button').click();
    await expect.poll(() => confirmationCount(page)).toBe(1);

    // Backing out must not write the document or the backup it would have made.
    const onDisk = await readVirtualFile(page, openPath);
    expect(onDisk!.equals(originalBytes)).toBe(true);
    expect(await readVirtualFile(page, backupPathFor(openPath))).toBeNull();
    expect(await pendingEdits(page)).toBeGreaterThanOrEqual(before);
    await expect(page.locator('.save-state')).toBeHidden();
  });

  test('agreeing keeps the original beside the document, and asks only once', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);

    await save(page);
    const backup = await readVirtualFile(page, backupPathFor(openPath));
    expect(backup, 'the original must be kept').not.toBeNull();
    expect(backup!.equals(originalBytes)).toBe(true);
    expect((await readVirtualFile(page, openPath))!.equals(originalBytes)).toBe(false);

    const askedBefore = await confirmationCount(page);
    await drawShape(page, { x: 0.5, y: 0.6, width: 0.2, height: 0.1 });
    await save(page);
    expect(await confirmationCount(page), 'only the first overwrite asks').toBe(askedBefore);
  });

  test('a failed save stays visible with a retry, not only in the toolbar', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);

    await fillDisk(page, partPathFor(openPath));
    await page.evaluate(() => window.__IROHA_TEST__.setConfirmAnswer('ok'));
    await page.locator('.pdf-toolbar .primary-button').click();

    const banner = page.locator('.save-failure-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('the disk is full');
    await expect(banner).toContainText('unchanged');
    expect(
      (await readVirtualFile(page, openPath))!.equals(originalBytes),
      'a failed save must leave the document alone',
    ).toBe(true);

    // Retrying is the action the banner offers, and it succeeds once there is room.
    await fillDisk(page, null);
    await banner.getByRole('button', { name: 'Retry' }).click();
    await expect(banner).toBeHidden();
    await expect(page.locator('.save-state')).toContainText('Saved to');
    expect((await readVirtualFile(page, openPath))!.equals(originalBytes)).toBe(false);
  });
});
