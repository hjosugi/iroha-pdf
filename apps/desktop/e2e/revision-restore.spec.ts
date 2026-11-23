/**
 * Restoring a saved revision (#101).
 *
 * The history always recorded what a save wrote; the missing half was the bytes.
 * These drive two saves, restore the older one, and check the copy that lands —
 * not just that a button appeared.
 */
import { expect, test } from '@playwright/test';

import { boot, drawShape, nextSavePath, openPdf, save } from './helpers';
import { inspectPdf } from './inspect';
import { readVirtualFile } from './tauri-stub';

test.describe('restoring a revision', () => {
  test('writes the older save to a copy the user names', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await drawShape(page);
    await save(page);
    await drawShape(page, { x: 0.55, y: 0.6, width: 0.2, height: 0.12 });
    await save(page);

    // Two saves, newest first. The older one carries only the first mark.
    await expect(page.locator('.history-restore')).toHaveCount(2);
    const restoredPath = '/virtual/documents/restored.pdf';
    await nextSavePath(page, restoredPath);

    await page.locator('.history-restore').nth(1).click();
    await expect(page.locator('.history-restore-status')).toContainText('Restored to restored.pdf');

    const restored = await readVirtualFile(page, restoredPath);
    expect(restored).not.toBeNull();
    expect(restored!.equals(originalBytes)).toBe(false);
    const facts = await inspectPdf(restored!);
    expect(facts.annotationSubtypes.flat()).toHaveLength(1);

    // The document being edited was not touched by the restore.
    const current = await readVirtualFile(page, openPath);
    expect((await inspectPdf(current!)).annotationSubtypes.flat()).toHaveLength(2);
  });

  test('cancelling the save dialog writes nothing and says nothing', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);
    await save(page);

    await expect(page.locator('.history-restore')).toHaveCount(1);
    await nextSavePath(page, null);
    await page.locator('.history-restore').first().click();

    // Changing your mind is not an outcome worth announcing.
    await expect(page.locator('.history-restore-status')).toBeHidden();
    await expect(page.locator('.history-restore')).toBeEnabled();
  });
});
