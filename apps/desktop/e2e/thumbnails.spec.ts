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
import { expect, test, type Page } from '@playwright/test';

import { boot, openPdf } from './helpers';

/** Pages currently drawn, as opposed to slots, of which there is always one per page. */
function drawn(page: Page): Promise<number> {
  return page.locator('.thumbnail-image').count();
}

async function openPages(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Pages' }).click();
  await expect(page.locator('.thumbnail-strip')).toBeVisible();
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

  test('scrolling the strip does not accumulate pages without limit', async ({ page }) => {
    await boot(page, 'heavy.pdf');
    await openPdf(page);
    await openPages(page);
    await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);

    const strip = page.locator('.thumbnail-strip');
    for (let step = 1; step <= 12; step += 1) {
      await strip.evaluate((node, index) => {
        node.scrollTop = (node.scrollHeight / 12) * index;
      }, step);
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(2000);

    const count = await drawn(page);
    console.log(`[thumbnails] ${count} of 500 pages drawn after scrolling the whole strip`);
    // Walking the whole document must not leave the whole document drawn.
    //
    // Note what this does *not* establish. These fixture pages are nearly blank, so
    // their thumbnails are a few KiB and the 8 MiB budget is never approached — the
    // observed figure is single digits, and the ceiling is never reached, let alone
    // enforced. That eviction happens at the budget, in the right order, and releases
    // the bytes is covered by `src/thumbnails.test.ts` against sizes chosen to reach
    // it. What this test covers is the other half: that scrolling does not turn
    // laziness off.
    expect(count).toBeLessThan(120);

    // Every drawn slot must be a picture that still resolves. An evicted page whose
    // object URL was revoked but whose <img> stayed behind would be a broken image
    // sitting where a page used to be.
    const broken = await page.locator('.thumbnail-image').evaluateAll((nodes) =>
      nodes.filter((node) => (node as HTMLImageElement).naturalWidth === 0).length,
    );
    expect(broken, 'an evicted thumbnail must leave, not linger as a broken image').toBe(0);
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
});
