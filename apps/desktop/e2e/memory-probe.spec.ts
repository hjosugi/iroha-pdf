/**
 * Diagnostic, not a gate.
 *
 * The performance suite records that a 41.6 MB scan costs several hundred megabytes,
 * but not where they go. This breaks the cost down by stage so the fix targets the
 * right thing, and pushes the size up until something gives, so the practical ceiling
 * is a measured number rather than an extrapolation.
 *
 * Run explicitly: npx playwright test memory-probe --project=chromium
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { test } from '@playwright/test';

import { buildImageHeavyPdf, FIXTURE_DIR, fixturePath } from './fixtures';
import { firstPage, openPdf } from './helpers';
import { installTauriStub } from './tauri-stub';

type Sample = { stage: string; dirtyMb: number; liveMb: number };

/**
 * Reads the heap over CDP rather than `performance.memory`.
 *
 * `performance.memory` is quantised and cached for ~30 seconds, so repeated reads in
 * one session return the same number regardless of what the app is doing. Anything
 * measured that way is unreliable. CDP's Performance domain reports the real
 * JSHeapUsedSize on every call, and HeapProfiler.collectGarbage gives a true
 * collection, so the live figure is memory actually being held.
 */
async function sample(
  page: import('@playwright/test').Page,
  cdp: import('@playwright/test').CDPSession,
  stage: string,
): Promise<Sample> {
  const read = async (): Promise<number> => {
    const { metrics } = (await cdp.send('Performance.getMetrics')) as {
      metrics: Array<{ name: string; value: number }>;
    };
    const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
    return Math.round((used / 1024 / 1024) * 10) / 10;
  };

  const dirtyMb = await read();
  await cdp.send('HeapProfiler.collectGarbage');
  await page.waitForTimeout(400);
  const liveMb = await read();

  return { stage, dirtyMb, liveMb };
}

function report(samples: Sample[]): void {
  console.log('[mem] stage                        before-gc    live');
  for (const entry of samples) {
    console.log(
      `[mem] ${entry.stage.padEnd(26)} ${String(entry.dirtyMb).padStart(8)} ${String(entry.liveMb).padStart(7)}`,
    );
  }
}

test('where the memory goes on a byte-heavy PDF', async ({ page }) => {
  test.setTimeout(240_000);

  const path = '/virtual/documents/image-heavy.pdf';
  const bytes = await readFile(fixturePath('image-heavy.pdf'));
  const url = 'http://fixtures.test/image-heavy.pdf';
  await page.route(url, (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: bytes }),
  );
  await installTauriStub(page, {
    files: {},
    fileUrls: { [path]: url },
    openPath: path,
    savePath: path,
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  const samples: Sample[] = [];
  await page.goto('/');
  samples.push(await sample(page, cdp, 'app shell idle'));

  // Pull the bytes in without handing them to the engine, to separate transfer cost
  // from decode cost.
  await page.evaluate(async (target) => {
    const raw = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_file', { path: target });
    (globalThis as { __probeBytes?: unknown }).__probeBytes = raw;
  }, path);
  samples.push(await sample(page, cdp, `bytes in page (${Math.round(bytes.length / 1024 / 1024)} MB)`));

  await page.evaluate(() => {
    delete (globalThis as { __probeBytes?: unknown }).__probeBytes;
  });
  samples.push(await sample(page, cdp, 'bytes released'));

  await openPdf(page);
  samples.push(await sample(page, cdp, 'document open, page 1'));

  await page.locator('.pdf-viewport').evaluate((node) => {
    node.scrollTop = node.scrollHeight / 2;
  });
  await page.waitForTimeout(3000);
  samples.push(await sample(page, cdp, 'scrolled to middle'));

  await page.locator('.pdf-viewport').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await page.waitForTimeout(3000);
  samples.push(await sample(page, cdp, 'scrolled to end'));

  await page.locator('.pdf-viewport').evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.waitForTimeout(3000);
  samples.push(await sample(page, cdp, 'back to the top'));

  report(samples);
  const sizeMb = bytes.length / 1024 / 1024;
  const peakDirty = Math.max(...samples.map((entry) => entry.dirtyMb));
  const peakLive = Math.max(...samples.map((entry) => entry.liveMb));
  console.log(
    `[mem] for a ${sizeMb.toFixed(1)} MB file: peak before-gc ${peakDirty} MB ` +
      `(${(peakDirty / sizeMb).toFixed(1)}x), peak live ${peakLive} MB ` +
      `(${(peakLive / sizeMb).toFixed(1)}x)`,
  );
});

test('how large a scan can actually be opened', async ({ page }) => {
  test.setTimeout(900_000);

  // Every page needs its own image: reusing a pool keeps the byte count flat no matter
  // how many pages there are, which is exactly what this test must not do.
  for (const pageCount of [12, 24, 36, 48, 72]) {
    const name = `scan-${pageCount}.pdf`;
    const target = join(FIXTURE_DIR, name);
    if (!existsSync(target)) {
      await writeFile(target, await buildImageHeavyPdf(pageCount, pageCount, 1100));
    }
    const bytes = await readFile(target);
    const sizeMb = bytes.length / 1024 / 1024;

    const path = `/virtual/documents/${name}`;
    const url = `http://fixtures.test/${name}`;
    const context = await page.context().newPage();
    await context.route(url, (route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: bytes }),
    );
    await installTauriStub(context, {
      files: {},
      fileUrls: { [path]: url },
      openPath: path,
      savePath: path,
    });

    let crashed = false;
    context.on('crash', () => {
      crashed = true;
    });
    context.on('pageerror', (error) => console.log(`[ceiling]   page error: ${error.message}`));

    const started = Date.now();
    let outcome = 'ok';
    try {
      await context.goto('/');
      await context.getByRole('button', { name: 'Open PDF' }).click();
      await firstPage(context).waitFor({ state: 'visible', timeout: 120_000 });
    } catch (error) {
      outcome = error instanceof Error ? error.message.split('\n')[0]! : 'failed';
    }
    const elapsed = Date.now() - started;

    // Past a certain size the renderer is killed outright, which takes the CDP session
    // with it. That is the ceiling, so record it rather than failing the run.
    let live = 'n/a';
    try {
      const cdp = await context.context().newCDPSession(context);
      await cdp.send('Performance.enable');
      const measured = await sample(context, cdp, 'open');
      live = `${measured.liveMb} MB  ${(measured.liveMb / sizeMb).toFixed(1)}x`;
    } catch {
      outcome = crashed ? 'RENDERER CRASHED' : outcome === 'ok' ? 'renderer gone' : outcome;
    }
    if (crashed) outcome = 'RENDERER CRASHED';

    console.log(
      `[ceiling] ${String(pageCount).padStart(4)} pages  ${sizeMb.toFixed(1).padStart(6)} MB  ` +
        `${String(elapsed).padStart(6)} ms  live ${live.padStart(16)}  ${outcome}`,
    );
    await context.close().catch(() => {});
    if (outcome !== 'ok') break;
  }
});
