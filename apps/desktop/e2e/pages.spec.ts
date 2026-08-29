/**
 * Merge, split, extract and remove, on the desktop.
 *
 * The operations themselves have been in `packages/core` and tested there since
 * mobile wired them up; #19's remaining half was that desktop — "the platform
 * where someone actually assembles documents" — could not reach any of them.
 *
 * `rotated-mixed.pdf` is the fixture because its twelve pages come in three
 * blocks of four distinct widths (595, 612, 842). A page that went missing, got
 * duplicated, or came back in the wrong order is visible in the widths alone,
 * which a same-size fixture would hide.
 */
import { expect, test, type Page } from '@playwright/test';

import { boot, nextOpenPaths, nextSavePath, nextSavePaths, openPdf } from './helpers';
import { readVirtualFile } from './tauri-stub';

const SOURCE = '/virtual/documents/rotated-mixed.pdf';
const OUT = '/virtual/documents/out.pdf';
const OUT2 = '/virtual/documents/out2.pdf';

/** The width of every page, which is how this fixture identifies its pages. */
async function widths(page: Page, path: string): Promise<number[]> {
  const bytes = await readVirtualFile(page, path);
  expect(bytes, `${path} should have been written`).not.toBeNull();
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(new Uint8Array(bytes!));
  return pdf.getPages().map((each) => Math.round(each.getWidth()));
}

async function openPages(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Pages…' }).click();
  await expect(page.getByRole('dialog', { name: 'Work with pages' })).toBeVisible();
}

async function run(page: Page, operation: string, selection?: string): Promise<void> {
  await page.getByRole('radio', { name: new RegExp(operation) }).check();
  if (selection !== undefined) await page.getByLabel('Pages', { exact: true }).fill(selection);
  await page.getByRole('button', { name: 'Run' }).click();
}

test.describe('desktop page operations', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page, 'rotated-mixed.pdf', { openPath: SOURCE, savePath: OUT });
    await openPdf(page);
  });

  test('extracts the pages named, in the order named', async ({ page }) => {
    await openPages(page);
    await run(page, 'Extract to a new PDF', '2, 5-6');

    await expect(page.locator('.save-state')).toContainText('Saved out.pdf');
    // Pages 2, 5 and 6 one-based: one from the first block, two from the second.
    expect(await widths(page, OUT)).toEqual([595, 612, 612]);
  });

  test('removes the pages named and keeps the rest', async ({ page }) => {
    await openPages(page);
    await run(page, 'Remove and save', '1-8');

    await expect(page.locator('.save-state')).toContainText('Saved out.pdf');
    expect(await widths(page, OUT)).toEqual([842, 842, 842, 842]);
  });

  /**
   * The halves have to be the whole document exactly once. Built by hand from
   * complementary page lists, a gap or an overlap is one typo away, which is why
   * core names the operation rather than leaving it to two calls.
   */
  test('splits into two documents that are the original exactly once', async ({ page }) => {
    await nextSavePaths(page, [OUT, OUT2]);
    await openPages(page);
    await run(page, 'Split into two', '4');

    await expect(page.locator('.save-state')).toContainText('out.pdf');
    const first = await widths(page, OUT);
    const second = await widths(page, OUT2);
    expect(first).toEqual([595, 595, 595, 595]);
    expect(second).toEqual([612, 612, 612, 612, 842, 842, 842, 842]);
    expect(first.length + second.length).toBe(12);
  });

  test('merges the PDFs it was given', async ({ page }) => {
    await nextOpenPaths(page, [SOURCE, SOURCE]);
    await openPages(page);
    await run(page, 'Merge PDFs');

    await expect(page.locator('.save-state')).toContainText('Saved out.pdf');
    expect(await widths(page, OUT)).toHaveLength(24);
  });

  test('will not merge a single PDF', async ({ page }) => {
    await nextOpenPaths(page, [SOURCE]);
    await openPages(page);
    await run(page, 'Merge PDFs');

    await expect(page.locator('.save-state')).toContainText('at least two PDFs');
    expect(await readVirtualFile(page, OUT)).toBeNull();
  });

  test('says which fragment of a page selection it could not read', async ({ page }) => {
    await openPages(page);
    await run(page, 'Extract to a new PDF', '1, banana');

    await expect(page.locator('.save-state')).toContainText('Invalid page number: banana');
    await expect(page.locator('.save-state')).toContainText('open document is unchanged');
    expect(await readVirtualFile(page, OUT)).toBeNull();
  });

  test('refuses a page the document does not have', async ({ page }) => {
    await openPages(page);
    await run(page, 'Extract to a new PDF', '99');

    await expect(page.locator('.save-state')).toContainText('open document is unchanged');
    expect(await readVirtualFile(page, OUT)).toBeNull();
  });

  /** Dismissing the save dialog is changing your mind, not something going wrong. */
  test('says nothing when the save dialog is dismissed', async ({ page }) => {
    await nextSavePath(page, null);
    await openPages(page);
    await run(page, 'Extract to a new PDF', '1');

    await expect(page.locator('.save-state')).toBeHidden();
    expect(await readVirtualFile(page, OUT)).toBeNull();
  });

  /**
   * Every one of these writes a new file. The document being annotated keeps its
   * bytes, its draft and its edit history — splitting a document you are working
   * on must not be a way to lose the work.
   */
  test('never touches the document that is open', async ({ page }) => {
    const before = await readVirtualFile(page, SOURCE);
    await nextSavePaths(page, [OUT, OUT2]);
    await openPages(page);
    await run(page, 'Split into two', '4');
    await expect(page.locator('.save-state')).toContainText('out.pdf');

    expect((await readVirtualFile(page, SOURCE))!.equals(before!)).toBe(true);
  });
});
