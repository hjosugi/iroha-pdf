/**
 * The note beside a document, and what happens when storage will not take it.
 *
 * Desktop notes used to live only in `localStorage`, so clearing site data took
 * them and a refused write left nothing behind (#239). They now go through a
 * write-ahead journal in the app's private data directory: the first test pins
 * that the note outlives site data, and the next pins that an interrupted write
 * is offered back instead of being lost.
 */
import { expect, test, type Page } from '@playwright/test';

import { boot, openPdf } from './helpers';

const NOTE_DEBOUNCE_MS = 400;

async function openNoteTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Note' }).click();
  await expect(page.locator('.note-body')).toBeVisible();
}

async function setNoteStoreFailure(
  page: Page,
  failure: 'notes' | 'all' | null,
): Promise<void> {
  await page.evaluate((value) => window.__IROHA_TEST__.setNoteStoreFailure(value), failure);
}

const storedNoteBodies = (page: Page) =>
  page.evaluate(() => {
    const raw = window.__IROHA_TEST__.noteStore();
    return Object.values(JSON.parse(raw) as Record<string, { body?: string }>).map(
      (note) => note.body ?? '',
    );
  });

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
    expect(await storedNoteBodies(page)).toContain('check clause 4');
  });

  test('outlives site data being cleared', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openNoteTab(page);

    await page.locator('.note-body').fill('survives a cleared webview');
    await expect(page.locator('.saved-indicator')).toHaveText('Autosaved locally');

    // What the old implementation stored the note in. The note must not be there.
    await page.evaluate(() => localStorage.clear());
    expect(
      await page.evaluate(() => Object.keys(localStorage).some((key) => key.includes(':note:'))),
      'the note must not live in webview storage',
    ).toBe(false);

    // A remount reads it back from the note store, not from this session's state.
    await page.getByRole('tab', { name: 'Edit history' }).click();
    await openNoteTab(page);
    await expect(page.locator('.note-body')).toHaveValue('survives a cleared webview');
  });

  test('offers back a note whose durable write failed', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openNoteTab(page);

    await setNoteStoreFailure(page, 'notes');
    await page.locator('.note-body').fill('this cannot be stored');
    await page.waitForTimeout(NOTE_DEBOUNCE_MS * 2);

    // An async refusal must not take the workspace down.
    expect(await page.evaluate(() => document.getElementById('root')?.children.length ?? 0))
      .toBeGreaterThan(0);
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.saved-indicator')).toHaveText('Note could not be saved');
    await expect(page.locator('.saved-indicator')).toHaveAttribute('role', 'alert');

    // The attempt is in the journal, so remounting reconciles it and offers it back
    // rather than starting from the last durable note. Keep the durable write failing
    // while the panel unmounts, so its flush stays in the journal too.
    await page.getByRole('tab', { name: 'Edit history' }).click();
    await openNoteTab(page);

    const banner = page.locator('.note-recovery-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('interrupted save');
    // Restoring must be able to write the durable note again.
    await setNoteStoreFailure(page, null);
    await banner.getByRole('button', { name: 'Restore' }).click();

    await expect(page.locator('.note-recovery-banner')).toBeHidden();
    await expect(page.locator('.note-body')).toHaveValue('this cannot be stored');
    await expect(page.locator('.saved-indicator')).toHaveText('Autosaved locally');
    expect(await storedNoteBodies(page)).toContain('this cannot be stored');

    // Closing the document, which unmounts the panel for good, still must not throw.
    await page.locator('.tab-close').first().click();
    await expect(page.locator('.app-shell')).toBeVisible();
  });

  test('migrates a note written by the localStorage version', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    // The old version keyed the note the same way the new one does: the file path.
    await page.evaluate(
      (path) =>
        localStorage.setItem(
          `iroha-pdf:note:${path}`,
          JSON.stringify({
            id: `desktop-note:${path}`,
            title: 'Linked note',
            body: 'written before the journal',
            linkedDocumentId: path,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          }),
        ),
      openPath,
    );

    await openNoteTab(page);
    await expect(page.locator('.note-body')).toHaveValue('written before the journal');
    await expect
      .poll(async () => storedNoteBodies(page), { timeout: 10_000 })
      .toContain('written before the journal');
  });
});
