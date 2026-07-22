import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { sha256 } from './fixtures';
import { backupPathFor, boot, drawShape, openPdf, pendingEdits, save, saveAs } from './helpers';
import { extractText, inspectPdf } from './inspect';
import { listVirtualFiles, readVirtualFile } from './tauri-stub';

test.describe('editing a complex PDF', () => {
  test('an annotation reaches the saved file and the original content survives', async ({
    page,
  }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    const before = await inspectPdf(originalBytes);
    expect(before.pageCount).toBe(2);
    expect(before.annotationSubtypes.flat()).toEqual([]);
    expect(before.imageCount).toBeGreaterThan(0);
    expect(before.fontNames.some((name) => name.includes('NotoSansJP'))).toBe(true);

    await openPdf(page);
    await drawShape(page);
    expect(await pendingEdits(page)).toBeGreaterThan(0);

    await save(page);

    const saved = await readVirtualFile(page, openPath);
    expect(saved, 'the app must have written to the opened path').not.toBeNull();
    expect(sha256(saved!)).not.toBe(sha256(originalBytes));

    const after = await inspectPdf(saved!);

    // The point of the whole feature: the edit is in the file, not beside it.
    expect(after.annotationSubtypes.flat().length).toBeGreaterThan(0);

    // ...and nothing else was destroyed on the way through.
    expect(after.pageCount).toBe(before.pageCount);
    expect(after.imageCount).toBe(before.imageCount);
    expect(after.fontNames.some((name) => name.includes('NotoSansJP'))).toBe(true);

    const directory = await mkdtemp(join(tmpdir(), 'iroha-e2e-'));
    const savedPath = join(directory, 'saved.pdf');
    await writeFile(savedPath, saved!);
    const text = extractText(savedPath);
    if (text !== null) {
      expect(text, 'CJK body text must survive the round trip').toContain('四半期報告書');
      expect(text, 'table cell text must survive').toContain('売上高');
      expect(text, 'second page must survive').toContain('付録');
    }
  });

  test('the first overwrite keeps a pristine copy of the original', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    const backup = backupPathFor(openPath);

    await openPdf(page);
    await drawShape(page);
    await save(page);

    const kept = await readVirtualFile(page, backup);
    expect(kept, 'a backup must exist after the first overwrite').not.toBeNull();
    expect(sha256(kept!)).toBe(sha256(originalBytes));
  });

  test('a second save does not clobber the pristine copy', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    const backup = backupPathFor(openPath);

    await openPdf(page);
    await drawShape(page);
    await save(page);

    await drawShape(page, { x: 0.5, y: 0.55, width: 0.3, height: 0.12 });
    await save(page);

    const kept = await readVirtualFile(page, backup);
    expect(
      sha256(kept!),
      'the backup must still be the bytes originally opened, not the first save',
    ).toBe(sha256(originalBytes));

    const saved = await readVirtualFile(page, openPath);
    const after = await inspectPdf(saved!);
    expect(after.annotationSubtypes.flat().length).toBeGreaterThanOrEqual(2);
  });

  test('save as writes to the chosen path and leaves the original untouched', async ({ page }) => {
    const target = '/virtual/documents/copy.pdf';
    const { openPath, originalBytes } = await boot(page, 'complex.pdf', { savePath: target });

    await openPdf(page);
    await drawShape(page);
    await saveAs(page);

    const written = await readVirtualFile(page, target);
    expect(written).not.toBeNull();
    expect((await inspectPdf(written!)).annotationSubtypes.flat().length).toBeGreaterThan(0);

    const untouched = await readVirtualFile(page, openPath);
    expect(
      sha256(untouched!),
      'save as must not modify the file that was opened',
    ).toBe(sha256(originalBytes));
    expect(await listVirtualFiles(page)).not.toContain(backupPathFor(openPath));
  });

  test('cancelling the save dialog writes nothing', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf', { savePath: null });

    await openPdf(page);
    await drawShape(page);
    await page.getByRole('button', { name: 'Save as…' }).click();

    // Nothing should have been written; give the app a moment to prove it.
    await page.waitForTimeout(500);
    const untouched = await readVirtualFile(page, openPath);
    expect(sha256(untouched!)).toBe(sha256(originalBytes));
  });

  test('rotated and mixed-size pages keep their geometry through a save', async ({ page }) => {
    const rotatedPath = '/virtual/documents/rotated-mixed.pdf';
    const { originalBytes } = await boot(page, 'rotated-mixed.pdf', { openPath: rotatedPath });
    const before = await inspectPdf(originalBytes);

    await openPdf(page);
    await drawShape(page);
    await save(page);

    const saved = await readVirtualFile(page, rotatedPath);
    const after = await inspectPdf(saved!);
    expect(after.pageCount).toBe(before.pageCount);
  });

  test('edit history records the edit and the save', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page);
    await save(page);

    const history = page.locator('.history-list');
    await expect(history).toBeVisible();
    await expect(history.locator('.history-item.save')).toHaveCount(1);
    await expect(history.locator('.history-item.edit').first()).toBeVisible();
  });
});
