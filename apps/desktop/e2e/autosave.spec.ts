/**
 * Surviving a crash.
 *
 * The unsaved-edit guard only covers deliberate closes. A power cut, an OOM kill or a
 * webview crash gives no chance to prompt, so annotations are drafted to storage as
 * they are made. Reloading the page without saving is a faithful stand-in: the app is
 * gone mid-edit and comes back with whatever it had persisted.
 */
import { expect, test, type Page } from '@playwright/test';

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
import { inspectPdf } from './inspect';
import { listVirtualFiles, readVirtualFile } from './tauri-stub';

const DRAFT_KEY = (path: string) => `iroha-pdf:draft:${path}`;

function readDraft(page: Page, path: string) {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { savedAt: parsed.savedAt, count: parsed.items?.length ?? 0 };
  }, DRAFT_KEY(path));
}

/** Reload without saving: the document is gone, only persisted state comes back. */
async function crash(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible();
}

test.describe('autosave and recovery', () => {
  test('an edit is drafted without being asked to save', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    expect(await readDraft(page, openPath), 'no draft before any edit').toBeNull();

    await drawShape(page);
    await expect
      .poll(async () => (await readDraft(page, openPath))?.count ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(0);
  });

  test('a saved document leaves no draft behind', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);
    await expect.poll(async () => (await readDraft(page, openPath))?.count ?? 0).toBeGreaterThan(0);

    await save(page);

    // The annotations are in the file now, so a stale draft would only cause a
    // pointless recovery prompt on the next open.
    expect(await readDraft(page, openPath), 'saving must clear the draft').toBeNull();
  });

  test('work survives a crash and is offered back', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);
    await expect.poll(async () => (await readDraft(page, openPath))?.count ?? 0).toBeGreaterThan(0);

    // The file on disk is still untouched: nothing was saved.
    const onDisk = await readVirtualFile(page, openPath);
    expect(onDisk!.equals(originalBytes)).toBe(true);

    await crash(page);
    await openPdf(page);

    const banner = page.locator('.recovery-banner');
    await expect(banner, 'the recovered work must be offered').toBeVisible();
    await expect(banner).toContainText('Unsaved work recovered');
  });

  test('restoring puts the annotations back, and they can then be saved', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);
    await expect.poll(async () => (await readDraft(page, openPath))?.count ?? 0).toBeGreaterThan(0);

    await crash(page);
    await openPdf(page);
    await page.getByRole('button', { name: 'Restore' }).click();

    await expect(page.locator('.recovery-banner')).toBeHidden();
    // Restored work is unsaved work, and must be reported as such.
    await expect.poll(() => pendingEdits(page), { timeout: 10_000 }).toBeGreaterThan(0);

    await save(page);
    const saved = await readVirtualFile(page, openPath);
    expect(saved!.equals(originalBytes)).toBe(false);

    const facts = await inspectPdf(saved!);
    expect(
      facts.annotationSubtypes.flat().length,
      'the recovered annotation must reach the file',
    ).toBeGreaterThan(0);
  });

  test('discarding removes the draft for good', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);
    await expect.poll(async () => (await readDraft(page, openPath))?.count ?? 0).toBeGreaterThan(0);

    await crash(page);
    await openPdf(page);
    await page.getByRole('button', { name: 'Discard' }).click();

    await expect(page.locator('.recovery-banner')).toBeHidden();
    expect(await readDraft(page, openPath), 'discard must delete the draft').toBeNull();

    // And it must not come back on the next open.
    await crash(page);
    await openPdf(page);
    await expect(page.locator('.recovery-banner')).toBeHidden();
  });

  test('opening a file with no draft shows no banner', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await page.waitForTimeout(1500);
    await expect(page.locator('.recovery-banner')).toBeHidden();
  });
});

/**
 * A crash is not the only way a save is interrupted. A disk with no room left stops it
 * partway through, and a write empties its target before it starts filling it — so the
 * question these answer is whether what is left on disk is still the document.
 */
test.describe('a save that runs out of room', () => {
  test('never writes into the document itself', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);

    // If the save wrote straight into the document, this is the write that would empty
    // it. It has to go somewhere else, so this must not fire at all.
    await fillDisk(page, openPath);
    await save(page);

    await expect(page.locator('.save-state')).toContainText('Saved to');
    const saved = await readVirtualFile(page, openPath);
    expect(saved!.length, 'the document must not be left empty').toBeGreaterThan(0);
    expect(saved!.equals(originalBytes), 'the annotation must have reached the file').toBe(false);
    expect(saved!.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('leaves the document as it was, and the work still recoverable', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);
    await expect.poll(async () => (await readDraft(page, openPath))?.count ?? 0).toBeGreaterThan(0);

    await fillDisk(page, partPathFor(openPath));
    await save(page);

    await expect(page.locator('.save-state')).toContainText('the disk is full');
    // The one thing someone whose save just failed needs to know.
    await expect(page.locator('.save-state')).toContainText('unchanged');

    const onDisk = await readVirtualFile(page, openPath);
    expect(onDisk!.equals(originalBytes), 'the document must be byte-identical').toBe(true);
    expect(await readVirtualFile(page, backupPathFor(openPath))).not.toBeNull();

    // Nothing reached the file, so the draft is still the only copy of the edit and
    // must survive to be offered back.
    expect(await readDraft(page, openPath)).not.toBeNull();
    expect(await pendingEdits(page)).toBeGreaterThan(0);

    // With room again, the same edit saves.
    await fillDisk(page, null);
    await save(page);
    await expect(page.locator('.save-state')).toContainText('Saved to');
    const saved = await readVirtualFile(page, openPath);
    expect(saved!.equals(originalBytes)).toBe(false);
    const facts = await inspectPdf(saved!);
    expect(facts.annotationSubtypes.flat().length).toBeGreaterThan(0);
    expect(await readDraft(page, openPath), 'a completed save clears the draft').toBeNull();
    // And the partial is not left lying beside a document that saved fine.
    expect(await listVirtualFiles(page)).not.toContain(partPathFor(openPath));
  });
});
