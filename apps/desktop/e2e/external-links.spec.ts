/**
 * External links (#57).
 *
 * A link annotation is a URL the document chose. It must not open on a click;
 * it asks, names the URL, and only then hands it to the OS.
 */
import { expect, test, type Page } from '@playwright/test';

import { boot, firstPage, openPdf } from './helpers';
import { invokeCalls } from './tauri-stub';

/** The fixture's link covers the text near the top of the page. */
async function clickLink(page: Page): Promise<void> {
  const box = await firstPage(page).boundingBox();
  if (!box) throw new Error('page 1 has no bounding box');
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.14);
}

const confirmations = async (page: Page) =>
  (await invokeCalls(page)).filter((call) => call.cmd === 'plugin:dialog|message').length;

test.describe('external links', () => {
  test('asks, names the URL, and opens only after confirmation', async ({ page }) => {
    await boot(page, 'link.pdf', { confirmAnswer: 'ok' });
    await openPdf(page);
    await page.waitForTimeout(1500);

    await clickLink(page);
    await expect.poll(() => confirmations(page), { timeout: 10_000 }).toBe(1);
    await expect
      .poll(() => page.evaluate(() => window.__IROHA_TEST__.openedUrls()), { timeout: 10_000 })
      .toContain('https://example.com/iroha');
  });

  test('opens nothing when the confirmation is declined', async ({ page }) => {
    await boot(page, 'link.pdf', { confirmAnswer: 'cancel' });
    await openPdf(page);
    await page.waitForTimeout(1500);

    await clickLink(page);
    await expect.poll(() => confirmations(page), { timeout: 10_000 }).toBe(1);
    expect(await page.evaluate(() => window.__IROHA_TEST__.openedUrls())).toEqual([]);
  });
});
