/**
 * The note beside a document, and what happens when storage will not take it.
 *
 * The note lives only in `localStorage` — there is no journal behind it the way
 * mobile has (#12). So a refused write is the whole of the loss, and two things
 * have to hold: the app must survive it, and it must not go on claiming the note
 * is saved.
 *
 * The app part is not a nicety. The write is flushed from a `useEffect` cleanup,
 * React treats a throw there like one during render, and this app has no error
 * boundary — so an unguarded write turned a full disk into a blank window on the
 * next tab switch.
 */
import { expect, test, type Page } from '@playwright/test';

import { boot, openPdf } from './helpers';

const NOTE_DEBOUNCE_MS = 400;

async function openNoteTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Note' }).click();
  await expect(page.locator('.note-body')).toBeVisible();
}

/** Refuses every write, the way a full or disabled storage does. */
async function refuseStorageWrites(page: Page): Promise<void> {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('exceeded the quota', 'QuotaExceededError');
    };
  });
}

test.describe('the note beside a document', () => {
  test('keeps what was typed across a tab switch', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openNoteTab(page);

    await page.locator('.note-body').fill('check clause 4');
    await expect(page.locator('.saved-indicator')).toHaveText('Autosaved locally');

    await page.getByRole('tab', { name: 'Edit history' }).click();
    await openNoteTab(page);
    await expect(page.locator('.note-body')).toHaveValue('check clause 4');
  });

  test('survives a storage that refuses the write, and says so', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openNoteTab(page);

    await refuseStorageWrites(page);
    await page.locator('.note-body').fill('this cannot be stored');

    // Typing is already enough. Changing the note re-runs the effect, which runs
    // the previous cleanup, which flushes — so an unguarded write threw here, and
    // React emptied the root. Measured: `#root` had 0 children.
    await page.waitForTimeout(NOTE_DEBOUNCE_MS * 2);
    expect(await page.evaluate(() => document.getElementById('root')?.children.length ?? 0))
      .toBeGreaterThan(0);
    await expect(page.locator('.app-shell')).toBeVisible();

    // Saying "Saved" over a note nobody kept is the quiet half of losing it.
    await expect(page.locator('.saved-indicator')).toHaveText('Note could not be saved');
    await expect(page.locator('.saved-indicator')).toHaveAttribute('role', 'alert');

    // The flush on the way out runs in an effect cleanup. Unguarded, this is where
    // the whole workspace used to unmount.
    await page.getByRole('tab', { name: 'Edit history' }).click();
    await page.waitForTimeout(NOTE_DEBOUNCE_MS);
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Note' })).toBeVisible();

    // And closing the document, which unmounts the panel for good.
    await page.locator('.tab-close').first().click();
    await expect(page.locator('.app-shell')).toBeVisible();
  });
});
