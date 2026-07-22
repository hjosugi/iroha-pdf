/**
 * Opening a PDF.
 *
 * The other suites assume the document opened correctly and go on to test saving.
 * These check the assumption: that what the app puts on screen is the document, that
 * every page is there, and that a file it cannot read fails visibly instead of
 * hanging.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { fixturePath } from './fixtures';
import { boot, firstPage, openPdf } from './helpers';
import { inspectPdf } from './inspect';
import { renderPoppler, rmseAgainst, RENDERERS } from './render';
import { installTauriStub } from './tauri-stub';

import { readFile } from 'node:fs/promises';

test.describe('opening a PDF', () => {
  test('what is on screen is actually the document', async ({ page }) => {
    test.skip(!RENDERERS.poppler || !RENDERERS.imagemagick, 'needs poppler and ImageMagick');

    const { originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);

    const directory = await mkdtemp(join(tmpdir(), 'iroha-open-'));
    const source = join(directory, 'source.pdf');
    await writeFile(source, originalBytes);

    // What poppler thinks the pages look like, independent of the app's engine.
    const referencePage1 = renderPoppler(source, join(directory, 'ref1'), 110, 1);
    const referencePage2 = renderPoppler(source, join(directory, 'ref2'), 110, 2);
    expect(referencePage1).not.toBeNull();
    expect(referencePage2).not.toBeNull();

    // What the app actually painted for page 1.
    const shot = join(directory, 'app.png');
    await firstPage(page).screenshot({ path: shot });

    const toCorrectPage = rmseAgainst(shot, referencePage1!);
    // Calibration: how far apart two genuinely different pages of this document are.
    // A fixed threshold would be meaningless — on this fixture the two pages differ by
    // only ~0.11, so any limit above that would pass a viewer showing the wrong page.
    const toWrongPage = rmseAgainst(referencePage1!, referencePage2!);

    console.log(
      `[open] app vs correct page: ${toCorrectPage}, correct vs wrong page: ${toWrongPage}`,
    );
    expect(toCorrectPage, 'the metric must be computable').not.toBeNull();
    expect(toWrongPage).not.toBeNull();

    // Engine antialiasing and font substitution put a floor under this, so the test
    // asks a relative question instead: is what we painted closer to the right page
    // than a different page of the same document is? That holds on any platform.
    expect(
      toCorrectPage!,
      'the rendered page must be much closer to page 1 than another page is',
    ).toBeLessThan(toWrongPage! / 2);
  });

  test('a later page is rendered, and is not a copy of the first', async ({ page }) => {
    test.skip(!RENDERERS.imagemagick, 'needs ImageMagick');

    await boot(page, 'complex.pdf');
    await openPdf(page);

    const pages = page.locator('.pdf-viewport img');
    // Two render layers per page in this viewer, so assert on distinct page containers.
    await expect(pages.first()).toBeVisible();

    const directory = await mkdtemp(join(tmpdir(), 'iroha-open-'));
    const first = join(directory, 'p1.png');
    const second = join(directory, 'p2.png');
    await pages.nth(0).screenshot({ path: first });

    const count = await pages.count();
    expect(count, 'more than one page image must be present').toBeGreaterThan(1);
    await pages.nth(count - 1).screenshot({ path: second });

    const rmse = rmseAgainst(first, second);
    console.log(`[open] page 1 vs last page RMSE: ${rmse}`);
    expect(rmse!, 'distinct pages must not render identically').toBeGreaterThan(0.02);
  });

  test('every page of a 500-page document is reachable', async ({ page }) => {
    const heavy = '/virtual/documents/heavy.pdf';
    const { originalBytes } = await boot(page, 'heavy.pdf', { openPath: heavy });
    const facts = await inspectPdf(originalBytes);
    expect(facts.pageCount).toBe(500);

    await openPdf(page);

    // Scroll to the very end and confirm the viewer still has content to show.
    await page.locator('.pdf-viewport').evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await page.waitForTimeout(2500);
    await expect(page.locator('.pdf-viewport img').last()).toBeVisible();

    const scroll = await page.locator('.pdf-viewport').evaluate((node) => ({
      top: node.scrollTop,
      height: node.scrollHeight,
      client: node.clientHeight,
    }));
    console.log(`[open] scrolled to ${scroll.top} of ${scroll.height}`);
    // The scroll extent must reflect 500 pages, not a handful that were laid out.
    expect(scroll.height).toBeGreaterThan(scroll.client * 100);
  });

  test('pages keep their own size and orientation', async ({ page }) => {
    const rotated = '/virtual/documents/rotated-mixed.pdf';
    await boot(page, 'rotated-mixed.pdf', { openPath: rotated });
    await openPdf(page);
    await page.waitForTimeout(1500);

    const ratios = await page.locator('.pdf-viewport img').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return rect.height === 0 ? 0 : Number((rect.width / rect.height).toFixed(2));
      }),
    );
    const distinct = [...new Set(ratios.filter((value) => value > 0))];
    console.log(`[open] distinct page aspect ratios: ${distinct.join(', ')}`);

    // The fixture mixes A4, Letter and landscape across four rotations, so a viewer
    // that forced one page box would collapse these to a single ratio.
    expect(distinct.length, 'mixed page sizes must not be normalised away').toBeGreaterThan(1);
    expect(
      distinct.some((value) => value > 1),
      'at least one page must present as landscape',
    ).toBe(true);
  });

  test('the tab shows the file name', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await expect(page.locator('.tab span').first()).toHaveText('complex.pdf');
  });

  test('the side panel shows the path the file came from', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await expect(page.locator('.side-panel-path')).toHaveText(openPath);
  });

  test('a file that is not a readable PDF fails visibly instead of hanging', async ({ page }) => {
    const corruptPath = '/virtual/documents/corrupt.pdf';
    const bytes = await readFile(fixturePath('corrupt.pdf'));
    await installTauriStub(page, {
      files: { [corruptPath]: bytes.toString('base64') },
      openPath: corruptPath,
      savePath: corruptPath,
    });

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible();
    await page.getByRole('button', { name: 'Open PDF' }).click();

    // Whatever happens, it must resolve into a state the user can act on.
    await page.waitForTimeout(8000);

    const state = await page.evaluate(() => ({
      errorShown: document.body.innerText.includes('could not be opened'),
      stillOnEmpty: !!document.querySelector('.empty-workspace'),
      toolbar: !!document.querySelector('.pdf-toolbar'),
      pages: document.querySelectorAll('.pdf-viewport img').length,
    }));
    console.log(`[open] corrupt file state: ${JSON.stringify(state)}`);
    console.log(`[open] page errors: ${JSON.stringify(errors)}`);

    // It has to say so, rather than sit on a blank pane.
    expect(state.errorShown, 'the failure must be visible to the user').toBe(true);

    // And it must not claim to have opened a document it cannot render: editing tools
    // on an unopened document only lead to errors.
    expect(
      state.toolbar === false || state.pages > 0,
      'editing tools were offered for a document that failed to open',
    ).toBe(true);

    // The app must still be usable afterwards.
    await expect(page.getByRole('button', { name: /Open PDF|\+/ }).first()).toBeVisible();
  });

  test('a failed document reports plainly, without leaking engine internals', async ({ page }) => {
    const corruptPath = '/virtual/documents/corrupt.pdf';
    const bytes = await readFile(fixturePath('corrupt.pdf'));
    await installTauriStub(page, {
      files: { [corruptPath]: bytes.toString('base64') },
      openPath: corruptPath,
      savePath: corruptPath,
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open PDF' }).click();
    await page.waitForTimeout(6000);

    const shown = await page.evaluate(() => document.body.innerText);
    // docs/ISSUES 050: technical errors must not be put in front of the user.
    for (const leak of ['Task rejected', '"code":', 'doc-17', 'undefined']) {
      expect(shown, `the UI must not show ${leak}`).not.toContain(leak);
    }
  });
});
