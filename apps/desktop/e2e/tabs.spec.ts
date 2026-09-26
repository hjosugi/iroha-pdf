/**
 * The tab strip (#13): reorder, close, reopen, and the page each file was last
 * read at.
 *
 * Three documents are put on the virtual disk and opened through the dialog one
 * after another, so every tab has a real path — the only kind of tab that can
 * be reopened, and the only kind whose reading position can be remembered.
 */
import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { boot, openPdf } from './helpers';
import { fixturePath } from './fixtures';
import { removeVirtualFile, writeVirtualFile } from './tauri-stub';

const FIRST = '/virtual/documents/first.pdf';
const SECOND = '/virtual/documents/second.pdf';
const THIRD = '/virtual/documents/third.pdf';

/** The document tabs, left to right — not the side panel's own tabs. */
function tabNames(page: Page): Promise<string[]> {
  return page.getByRole('tablist', { name: 'Open files' }).getByRole('tab').allTextContents();
}

async function openAnother(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => window.__IROHA_TEST__.setOpenPath(target), path);
  await page.getByRole('button', { name: 'Open another PDF' }).click();
  await expect(page.getByRole('tab', { name: path.split('/').pop() })).toBeVisible();
}

/** The viewport's scroll position as a page number, from the rendered page boxes. */
async function pageInView(page: Page): Promise<number> {
  return page.locator('.pdf-viewport').evaluate((viewport) => {
    const top = viewport.getBoundingClientRect().top + viewport.clientHeight / 3;
    const pages = [...viewport.querySelectorAll<HTMLElement>('[data-page-index]')];
    const hit = pages.find((each) => {
      const box = each.getBoundingClientRect();
      return box.top <= top && box.bottom >= top;
    });
    return hit ? Number(hit.dataset.pageIndex) + 1 : 0;
  });
}

test.describe('document tabs', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page, 'rotated-mixed.pdf', { openPath: FIRST });
    const other = await readFile(fixturePath('complex.pdf'));
    await writeVirtualFile(page, SECOND, other);
    await writeVirtualFile(page, THIRD, other);
    await openPdf(page);
    await openAnother(page, SECOND);
    await openAnother(page, THIRD);
    expect(await tabNames(page)).toEqual(['first.pdf', 'second.pdf', 'third.pdf']);
  });

  test('moves a tab from the keyboard, and keeps it focused', async ({ page }) => {
    const first = page.getByRole('tab', { name: 'first.pdf' });
    await first.focus();
    await page.keyboard.press('Control+Shift+PageDown');
    expect(await tabNames(page)).toEqual(['second.pdf', 'first.pdf', 'third.pdf']);
    await expect(first).toBeFocused();

    await page.keyboard.press('Control+Shift+PageDown');
    await page.keyboard.press('Control+Shift+PageDown');
    // Past the end is nowhere to go.
    expect(await tabNames(page)).toEqual(['second.pdf', 'third.pdf', 'first.pdf']);
    await page.keyboard.press('Control+Shift+PageUp');
    expect(await tabNames(page)).toEqual(['second.pdf', 'first.pdf', 'third.pdf']);
  });

  test('moves a tab by dragging it onto another', async ({ page }) => {
    await page.getByRole('tab', { name: 'third.pdf' }).dragTo(page.getByRole('tab', { name: 'first.pdf' }));
    expect(await tabNames(page)).toEqual(['third.pdf', 'first.pdf', 'second.pdf']);
    // A drag is not a click: the tab that was active stays active.
    await expect(page.getByRole('tab', { name: 'third.pdf' })).toHaveAttribute('aria-selected', 'true');
  });

  test('reopens closed tabs, most recent first', async ({ page }) => {
    await page.getByRole('button', { name: 'Close tab: second.pdf' }).click();
    await expect.poll(() => tabNames(page)).toEqual(['first.pdf', 'third.pdf']);
    await page.getByRole('button', { name: 'Close tab: first.pdf' }).click();
    await expect.poll(() => tabNames(page)).toEqual(['third.pdf']);

    await page.keyboard.press('ControlOrMeta+Shift+T');
    await expect(page.getByRole('tab', { name: 'first.pdf' })).toBeVisible();
    await page.getByRole('button', { name: 'Reopen closed tab' }).click();
    await expect(page.getByRole('tab', { name: 'second.pdf' })).toBeVisible();
    await expect.poll(() => tabNames(page)).toEqual(['third.pdf', 'first.pdf', 'second.pdf']);
    // Nothing left to reopen.
    await expect(page.getByRole('button', { name: 'Reopen closed tab' })).toHaveCount(0);
  });

  test('says so when a closed file is gone', async ({ page }) => {
    await page.getByRole('button', { name: 'Close tab: second.pdf' }).click();
    await removeVirtualFile(page, SECOND);
    await page.getByRole('button', { name: 'Reopen closed tab' }).click();

    await expect(page.getByRole('alert')).toContainText('Could not reopen “second.pdf”');
    await expect.poll(() => tabNames(page)).toEqual(['first.pdf', 'third.pdf']);
  });

  test('goes back to the page a file was last read at', async ({ page }) => {
    await page.getByRole('tab', { name: 'first.pdf' }).click();
    const viewport = page.locator('.pdf-viewport');
    await expect.poll(() => pageInView(page)).toBe(1);

    // Read down to page 9 of 12: jump to about where it starts, then nudge.
    // Pages are drawn only near the view, so the page in view can be told only
    // once the scroll is close to it.
    await viewport.evaluate((node) => {
      node.scrollTop = (node.scrollHeight * 8.2) / 12;
    });
    // Nudged until it arrives rather than a fixed number of times: on a slow
    // runner the pages near the view are still being laid out between nudges.
    await expect(async () => {
      const current = await pageInView(page);
      if (current !== 9) {
        await viewport.evaluate(
          (node, direction) => node.scrollBy(0, (direction * node.clientHeight) / 4),
          current === 0 || current < 9 ? 1 : -1,
        );
      }
      expect(current).toBe(9);
    }).toPass({ intervals: [250], timeout: 30_000 });
    // The position is recorded as the reader goes, not only on close.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('iroha-pdf:app:last-pages') ?? ''))
      .toContain('"page":9');

    await page.getByRole('button', { name: 'Close tab: first.pdf' }).click();
    // Closing finishes asynchronously. Reopening before the old tab is gone
    // shows both for a moment, and a strict locator fails on that at once.
    await expect(page.getByRole('tab', { name: 'first.pdf' })).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+T');
    await expect(page.getByRole('tab', { name: 'first.pdf' })).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => pageInView(page), { timeout: 15_000 }).toBe(9);

    // And in a new window, opened through the dialog again.
    await page.reload();
    await page.evaluate((target) => window.__IROHA_TEST__.setOpenPath(target), FIRST);
    await openPdf(page);
    await expect.poll(() => pageInView(page), { timeout: 15_000 }).toBe(9);
  });
});
