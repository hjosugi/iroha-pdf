/**
 * Local-first, taken literally.
 *
 * The product claim is that a PDF on this machine opens on this machine. That is
 * not something the other suites check: they run on a networked machine, so an
 * engine quietly fetched from a CDN looks identical to one that shipped with the
 * app. It stops looking identical on a plane, behind a corporate proxy, or under
 * the `connect-src 'self'` policy the packaged app declares in tauri.conf.json.
 *
 * This suite opens a document with every off-origin request refused, and
 * separately watches what the app asks for, because a request the route handler
 * never sees would otherwise pass silently.
 */
import { expect, test } from '@playwright/test';

import { boot, firstPage, openPdf } from './helpers';

/** The stubbed filesystem hands bytes over as base64, blobs and data URLs. */
function isLocal(url: string, appOrigin: string): boolean {
  if (url.startsWith('blob:') || url.startsWith('data:')) return true;
  return url.startsWith(appOrigin);
}

test.describe('local-first', () => {
  test('a PDF opens with every off-origin request refused', async ({ page, baseURL }) => {
    const appOrigin = baseURL ?? 'http://localhost:4173';
    const asked: string[] = [];
    const refused: string[] = [];

    // Watching and blocking are not redundant. Blocking proves the app does not
    // need the network; watching catches a request that interception misses.
    page.on('request', (request) => {
      if (!isLocal(request.url(), appOrigin)) asked.push(request.url());
    });
    await page.context().route('**', (route) => {
      const url = route.request().url();
      if (isLocal(url, appOrigin)) return route.continue();
      refused.push(url);
      return route.abort();
    });

    // Small enough that the harness inlines it rather than serving it over HTTP,
    // so nothing in the rig itself needs an exemption here.
    await boot(page, 'rotated-mixed.pdf', { openPath: '/virtual/documents/rotated-mixed.pdf' });
    await openPdf(page);

    await expect(firstPage(page), 'the document must render with no network').toBeVisible();
    const pages = await page.locator('.pdf-viewport img').count();
    expect(pages, 'pages must actually be drawn, not just the toolbar').toBeGreaterThan(0);

    console.log(`[offline] off-origin requests: ${JSON.stringify([...new Set(asked)])}`);
    expect(
      [...new Set(asked)],
      'opening a local PDF must not reach any other host',
    ).toEqual([]);
    expect([...new Set(refused)]).toEqual([]);
  });
});
