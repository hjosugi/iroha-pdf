/**
 * Performance budgets.
 *
 * These are guard rails, not benchmarks: they are deliberately looser than the
 * numbers this machine actually produces, so they catch a regression that changes
 * the shape of the app rather than failing on ordinary machine-to-machine noise.
 * Observed values are logged on every run, so drift is visible before it trips.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { drawShape, firstPage, openPdf, save } from './helpers';
import { boot } from './helpers';
import { readVirtualFile } from './tauri-stub';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '../dist');

/**
 * Shared CI runners are slower and noisier than a developer machine. Scaling the time
 * budgets keeps the suite meaningful locally without it failing on runner variance;
 * the memory and size budgets are hardware-independent and are never scaled.
 */
const SCALE = Number(process.env.PERF_BUDGET_SCALE ?? '1') || 1;
const ms = (value: number) => Math.round(value * SCALE);

const BUDGETS = {
  /** docs/TEST_PLAN.md: the first page must be usable before everything renders. */
  firstPageInteractiveMs: ms(15_000),
  /** Saving a 500-page document must not feel like an export job. */
  heavySaveMs: ms(30_000),
  /** A byte-heavy scan has to decode images, not just lay out pages. */
  imageHeavyOpenMs: ms(30_000),
  imageHeavySaveMs: ms(60_000),
  /**
   * Live JS heap. Measured at ~6 MB for a 41 MB scan once garbage is collected, so
   * this is loose enough for noise but would catch the render cache actually retaining
   * pages. Note that ArrayBuffers and the wasm engine's memory live outside this
   * counter; the size ceiling is covered by e2e-tauri/size-ceiling.mjs instead.
   */
  heapMb: 120,
  /** Total shipped bytes, the honest measure of "app weight" for the web layer. */
  bundleMb: 12,
  /** Everything except the PDF engine wasm, which dominates and is not ours. */
  appJsMb: 2.5,
};

/**
 * Heap usage read over CDP.
 *
 * `performance.memory` is quantised and cached for roughly 30 seconds, so successive
 * reads in one session return the same figure no matter what the app does — it once
 * had this suite reporting an unchanged heap after scrolling as though that proved
 * virtualisation worked. CDP reports the real value on every call.
 */
async function jsHeapMb(page: import('@playwright/test').Page): Promise<number | null> {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = (await cdp.send('Performance.getMetrics')) as {
      metrics: Array<{ name: string; value: number }>;
    };
    await cdp.detach().catch(() => {});
    const used = metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value;
    return used === undefined ? null : used / 1024 / 1024;
  } catch {
    // Not Chromium, or the session went away; the timing budgets still apply.
    return null;
  }
}

test.describe('heavy documents', () => {
  test('a 500-page PDF becomes interactive quickly and stays workable', async ({ page }) => {
    const heavyPath = '/virtual/documents/heavy.pdf';
    await boot(page, 'heavy.pdf', { openPath: heavyPath });

    const started = Date.now();
    await page.getByRole('button', { name: 'Open PDF' }).click();
    await expect(firstPage(page)).toBeVisible();
    const firstPaint = Date.now() - started;
    console.log(`[perf] 500-page first page interactive: ${firstPaint} ms`);
    expect(firstPaint).toBeLessThan(BUDGETS.firstPageInteractiveMs);

    // The toolbar has to be live at that moment, not merely painted.
    await expect(page.getByRole('button', { name: 'Shape', exact: true })).toBeEnabled();

    const heap = await jsHeapMb(page);
    if (heap !== null) {
      console.log(`[perf] JS heap with 500 pages open: ${heap.toFixed(1)} MB`);
      expect(heap).toBeLessThan(BUDGETS.heapMb);
    }

    // Scrolling deep into the document must not require every page to be resident.
    const scrollStart = Date.now();
    await page.locator('.pdf-viewport').evaluate((node) => {
      node.scrollTop = node.scrollHeight / 2;
    });
    await page.waitForTimeout(1500);
    console.log(`[perf] scroll to the middle settled in ${Date.now() - scrollStart} ms`);

    const heapAfterScroll = await jsHeapMb(page);
    if (heapAfterScroll !== null) {
      console.log(`[perf] JS heap after scrolling: ${heapAfterScroll.toFixed(1)} MB`);
      expect(heapAfterScroll).toBeLessThan(BUDGETS.heapMb);
    }
  });

  test('annotating and saving a 500-page PDF stays within budget', async ({ page }) => {
    const heavyPath = '/virtual/documents/heavy.pdf';
    const { originalBytes } = await boot(page, 'heavy.pdf', { openPath: heavyPath });

    await openPdf(page);
    await drawShape(page);

    const started = Date.now();
    await save(page);
    const elapsed = Date.now() - started;
    console.log(`[perf] save of a 500-page document: ${elapsed} ms`);
    expect(elapsed).toBeLessThan(BUDGETS.heavySaveMs);

    const saved = await readVirtualFile(page, heavyPath);
    expect(saved).not.toBeNull();
    // A save that silently dropped most of the document would still be fast.
    expect(saved!.length).toBeGreaterThan(originalBytes.length * 0.5);
  });
});

test.describe('byte-heavy documents', () => {
  test('a 40 MB image-heavy scan opens, annotates and saves', async ({ page }) => {
    const scanPath = '/virtual/documents/image-heavy.pdf';
    const { originalBytes } = await boot(page, 'image-heavy.pdf', { openPath: scanPath });
    console.log(`[perf] fixture size: ${(originalBytes.length / 1024 / 1024).toFixed(1)} MB`);

    const started = Date.now();
    await page.getByRole('button', { name: 'Open PDF' }).click();
    await expect(firstPage(page)).toBeVisible();
    const opened = Date.now() - started;
    console.log(`[perf] image-heavy first page interactive: ${opened} ms`);
    expect(opened).toBeLessThan(BUDGETS.imageHeavyOpenMs);

    const heap = await jsHeapMb(page);
    if (heap !== null) {
      console.log(`[perf] JS heap with a 40 MB scan open: ${heap.toFixed(1)} MB`);
      expect(heap).toBeLessThan(BUDGETS.heapMb);
    }

    await drawShape(page);
    const saveStarted = Date.now();
    await save(page);
    const saveMs = Date.now() - saveStarted;
    console.log(`[perf] save of a 40 MB scan: ${saveMs} ms`);
    expect(saveMs).toBeLessThan(BUDGETS.imageHeavySaveMs);

    const saved = await readVirtualFile(page, scanPath);
    expect(saved).not.toBeNull();
    // Image data must not have been dropped on the way through.
    expect(saved!.length).toBeGreaterThan(originalBytes.length * 0.8);
  });
});

test.describe('app weight', () => {
  test('the shipped bundle stays small', async () => {
    const entries = await readdir(join(DIST, 'assets'));
    let total = 0;
    let appJs = 0;
    const breakdown: Array<[string, number]> = [];

    for (const entry of entries) {
      const { size } = await stat(join(DIST, 'assets', entry));
      total += size;
      breakdown.push([entry, size]);
      if (entry.endsWith('.js') && !entry.includes('engine')) appJs += size;
    }

    breakdown.sort((a, b) => b[1] - a[1]);
    for (const [name, size] of breakdown) {
      console.log(`[weight] ${(size / 1024 / 1024).toFixed(2)} MB  ${name}`);
    }
    console.log(`[weight] total ${(total / 1024 / 1024).toFixed(2)} MB`);

    expect(total / 1024 / 1024).toBeLessThan(BUDGETS.bundleMb);
    expect(appJs / 1024 / 1024).toBeLessThan(BUDGETS.appJsMb);
  });

  test('the app shell renders before the PDF engine is needed', async ({ page }) => {
    await boot(page, 'complex.pdf');

    // The empty workspace must not wait on the multi-megabyte wasm engine.
    const shellTiming = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType(
        'navigation',
      ) as PerformanceNavigationTiming[];
      const paint = performance
        .getEntriesByType('paint')
        .find((entry) => entry.name === 'first-contentful-paint');
      return {
        domContentLoaded: navigation?.domContentLoadedEventEnd ?? null,
        firstContentfulPaint: paint?.startTime ?? null,
      };
    });
    console.log(`[perf] shell timings: ${JSON.stringify(shellTiming)}`);

    if (shellTiming.firstContentfulPaint !== null) {
      expect(shellTiming.firstContentfulPaint).toBeLessThan(5_000);
    }
  });

  test('the wasm engine is fetched as its own asset, not inlined', async () => {
    const entries = await readdir(join(DIST, 'assets'));
    const wasm = entries.filter((entry) => entry.endsWith('.wasm'));
    expect(wasm.length, 'pdfium must ship as a separate wasm file').toBeGreaterThan(0);

    // If the engine were inlined as base64 the main chunk would balloon.
    const indexChunk = entries.find((entry) => entry.startsWith('index-') && entry.endsWith('.js'));
    if (indexChunk) {
      const contents = await readFile(join(DIST, 'assets', indexChunk), 'utf8');
      expect(contents.length).toBeLessThan(BUDGETS.appJsMb * 1024 * 1024);
    }
  });
});
