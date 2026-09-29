/**
 * The page strip, against the document that decides its design.
 *
 * heavy.pdf has 500 pages. Rendering all of them to show a strip would take minutes
 * and hold every bitmap at once, so what these check is not that thumbnails appear —
 * that is the easy half — but that the ones nobody is looking at were never rendered,
 * and that the ones that were do not accumulate without limit.
 *
 * Everything is read from the DOM rather than through a test hook. A slot exists for
 * every page whether or not it has been drawn, so the pages actually being held are
 * exactly the slots carrying an `<img>` — which is also what the reader sees.
 */
import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

import { boot, openPdf } from './helpers';
import { fixturePath } from './fixtures';
import { writeVirtualFile } from './tauri-stub';

/** Pages currently drawn, as opposed to slots, of which there is always one per page. */
function drawn(page: Page): Promise<number> {
  return page.locator('.thumbnail-image').count();
}

/** The page number (1-based) carried by the slot a drawn picture sits in. */
function drawnPages(page: Page): Promise<number[]> {
  return page.locator('.thumbnail-image').evaluateAll((nodes) =>
    nodes.map((node) => Number((node.closest('.thumbnail') as HTMLElement).dataset.page)),
  );
}

/**
 * The bytes the strip is actually holding, read from the blobs behind its object URLs.
 *
 * This is the same number the cache budgets by — `ThumbnailStore` sizes each entry with
 * `blob.size` — so a test that adds these up is measuring the budget directly rather
 * than a proxy for it.
 */
function heldBytes(page: Page): Promise<number> {
  return page.locator('.thumbnail-image').evaluateAll(async (nodes) => {
    let total = 0;
    for (const node of nodes) {
      const response = await fetch((node as HTMLImageElement).src);
      total += (await response.blob()).size;
    }
    return total;
  });
}

/** An `<img>` whose object URL was revoked but which stayed on screen as a broken image. */
function brokenImages(page: Page): Promise<number> {
  return page
    .locator('.thumbnail-image')
    .evaluateAll((nodes) =>
      nodes.filter((node) => (node as HTMLImageElement).naturalWidth === 0).length,
    );
}

async function openPages(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Pages' }).click();
  await expect(page.locator('.thumbnail-strip')).toBeVisible();
}

/** Drives the strip from top to bottom, letting the observer in each slot fire. */
async function scrollThroughStrip(page: Page, steps: number): Promise<void> {
  const strip = page.locator('.thumbnail-strip');
  for (let step = 0; step <= steps; step += 1) {
    await strip.evaluate((node, { index, total }) => {
      node.scrollTop = (node.scrollHeight / total) * index;
    }, { index: step, total: steps });
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(2000);
}

test.describe('page thumbnails', () => {
  test('a 500-page document gets 500 slots and nothing like 500 renders', async ({ page }) => {
    await boot(page, 'heavy.pdf');
    await openPdf(page);
    await openPages(page);

    // Every page has somewhere to appear, so the strip is the right length and scrolls
    // correctly from the start.
    await expect(page.locator('.thumbnail')).toHaveCount(500);

    // And then the point: only what is near the viewport was actually drawn.
    await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(3000);
    const count = await drawn(page);
    console.log(`[thumbnails] ${count} of 500 pages drawn`);
    expect(count, 'a strip that rendered every page would defeat the purpose').toBeLessThan(80);
  });

  test('scrolling the strip reaches later pages without drawing them all', async ({ page }) => {
    await boot(page, 'heavy.pdf');
    await openPdf(page);
    await openPages(page);
    await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);

    const strip = page.locator('.thumbnail-strip');
    // The regression this guards: with no bounded grid row the strip measured
    // scrollHeight === clientHeight, `scrollTop` did nothing, and every page past the
    // first screenful was unreachable. A test that scrolls has to prove it can.
    const { clientHeight, scrollHeight } = await strip.evaluate((node) => ({
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }));
    expect(scrollHeight, 'the strip must be a scroll container, not a growing one').toBeGreaterThan(
      clientHeight * 2,
    );

    for (let step = 1; step <= 20; step += 1) {
      await strip.evaluate((node, index) => {
        node.scrollTop = (node.scrollHeight / 20) * index;
      }, step);
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(2000);

    const pagesDrawn = await drawnPages(page);
    console.log(`[thumbnails] ${pagesDrawn.length} of 500 pages drawn after scrolling`);
    // Walking the whole document must not leave the whole document drawn.
    expect(pagesDrawn.length).toBeGreaterThan(20);
    expect(pagesDrawn.length).toBeLessThan(400);
    // And it did walk: a page from deep in the document has been reached.
    expect(Math.max(...pagesDrawn)).toBeGreaterThan(300);
    expect(await brokenImages(page)).toBe(0);
  });

  test('the byte budget evicts the least recently used pages under load', async ({ page }) => {
    // A scan, not the near-blank text fixture: this is the one document whose
    // thumbnails are heavy enough to reach THUMBNAIL_BUDGET_BYTES by scrolling. On
    // heavy.pdf the budget is never approached, so eviction was only ever proven by
    // unit tests at sizes chosen to reach it, never by the application under load (#52).
    await boot(page, 'scan-heavy.pdf');
    await openPdf(page);
    await openPages(page);

    const first = page.locator('.thumbnail[data-page="1"] .thumbnail-image');
    await expect(first, 'page 1 starts in hand').toBeVisible({ timeout: 30_000 });

    await scrollThroughStrip(page, 30);

    // The page that was in hand at the top has been dropped: eviction, not just
    // laziness skipping pages that were never asked for.
    await expect(first, 'the oldest page is gone once the budget is reached').toHaveCount(0);

    const total = await heldBytes(page);
    console.log(`[thumbnails] ${await drawn(page)} pages held, ${(total / 1024 / 1024).toFixed(2)} MiB`);
    expect(total, 'the budget is a ceiling, not a target').toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(total, 'and it should actually have been reached').toBeGreaterThan(4 * 1024 * 1024);

    const pagesDrawn = await drawnPages(page);
    expect(pagesDrawn.length).toBeLessThan(240);
    expect(Math.max(...pagesDrawn), 'scrolling reached the end').toBe(240);
    // A page dropped from the cache must leave, not linger as a revoked URL.
    expect(await brokenImages(page)).toBe(0);
  });

  test('a hidden window holds no thumbnails, and showing it again refills the strip', async ({
    page,
  }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openPages(page);
    await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);

    // The policy in `page-visibility.ts`, driven the way the platform drives it. The
    // event is dispatched rather than the tab backgrounded because a headless browser
    // has no OS to background it in.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await expect.poll(() => drawn(page), { timeout: 10_000 }).toBe(0);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Coming back has to refill: the observer never fired again, so a release without a
    // matching resume would leave these slots as placeholders for good.
    await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
  });

  test('a thumbnail is a picture of the page it says it is', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openPages(page);

    await expect(page.locator('.thumbnail')).toHaveCount(2);
    const first = page.locator('.thumbnail-image').first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await expect(first).toHaveAttribute('alt', 'Page 1');

    // A blob that decoded to something with area, rather than a broken image the
    // browser is happy to leave at zero, and portrait as the fixture is.
    const size = await first.evaluate((node) => ({
      width: (node as HTMLImageElement).naturalWidth,
      height: (node as HTMLImageElement).naturalHeight,
    }));
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(size.width);
  });

  test('leaving the tab takes the strip and its pictures with it', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await openPages(page);
    await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);

    await page.getByRole('tab', { name: 'Edit history' }).click();
    await expect(page.locator('.thumbnail-strip')).toBeHidden();
    expect(await drawn(page), 'no bitmaps are held for a panel nobody is looking at').toBe(0);
  });

  test('opening another document releases the thumbnails of the one before', async ({ page }) => {
    const first = '/virtual/documents/first.pdf';
    const second = '/virtual/documents/second.pdf';
    await boot(page, 'scan-heavy.pdf', { openPath: first });
    // A different document, deliberately of a different length, so a strip still in the
    // DOM from the first one cannot be mistaken for the second's.
    await writeVirtualFile(page, second, await readFile(fixturePath('complex.pdf')));
    await openPdf(page);
    await openPages(page);
    await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);

    await page.evaluate((target) => window.__IROHA_TEST__.setOpenPath(target), second);
    await page.getByRole('button', { name: 'Open another PDF' }).click();
    await expect(page.getByRole('tab', { name: 'second.pdf' })).toBeVisible();
    await openPages(page);
    await expect(page.locator('.thumbnail')).toHaveCount(2);

    await page.getByRole('tab', { name: 'first.pdf' }).click();
    await openPages(page);
    await expect(page.locator('.thumbnail')).toHaveCount(240);

    // Back on the 240-page document with a fresh store: only the screenful in view, not
    // the ~160 pages that were in hand before the switch. Holding those would be the
    // churn this checks for.
    await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
    const count = await drawn(page);
    console.log(`[thumbnails] ${count} of 240 pages drawn after a document round trip`);
    expect(count).toBeLessThan(40);
    expect(await brokenImages(page)).toBe(0);
  });
});
