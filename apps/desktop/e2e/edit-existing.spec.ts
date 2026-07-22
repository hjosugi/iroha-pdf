/**
 * Changing a mark that is already on the page.
 *
 * Picking a colour before drawing was the only control there was, so correcting an
 * existing highlight meant deleting it and drawing it again. These check that
 * selecting a mark and choosing a different colour or width actually rewrites the
 * annotation in the saved file rather than just repainting the preview.
 */
import { expect, test, type Page } from '@playwright/test';

import { boot, firstPage, openPdf, save } from './helpers';
import { inspectPdf } from './inspect';
import { readVirtualFile } from './tauri-stub';

const TITLE_LINE = { x1: 0.1, y1: 0.088, x2: 0.45, y2: 0.088 };
const BLANK_AREA = { x1: 0.2, y1: 0.6, x2: 0.55, y2: 0.72 };
const INK_SETTLE_MS = 1000;

async function useTool(page: Page, label: string): Promise<void> {
  const button = page.getByRole('button', { name: label, exact: true });
  if (!(await button.evaluate((node) => node.classList.contains('active')))) await button.click();
  await expect(button).toHaveClass(/active/);
}

async function putToolDown(page: Page, label: string): Promise<void> {
  const button = page.getByRole('button', { name: label, exact: true });
  if (await button.evaluate((node) => node.classList.contains('active'))) await button.click();
}

async function dragOn(page: Page, box: typeof BLANK_AREA): Promise<void> {
  const bounds = await firstPage(page).boundingBox();
  if (!bounds) throw new Error('page 1 has no bounding box');
  const sx = bounds.x + bounds.width * box.x1;
  const sy = bounds.y + bounds.height * box.y1;
  const ex = bounds.x + bounds.width * box.x2;
  const ey = bounds.y + bounds.height * box.y2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 10 });
  await page.mouse.move(ex, ey, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

/** Clicks the middle of a box, which is where a mark drawn there will be. */
async function clickInside(page: Page, box: typeof BLANK_AREA): Promise<void> {
  const bounds = await firstPage(page).boundingBox();
  if (!bounds) throw new Error('page 1 has no bounding box');
  await page.mouse.click(
    bounds.x + bounds.width * ((box.x1 + box.x2) / 2),
    bounds.y + bounds.height * ((box.y1 + box.y2) / 2),
  );
  await page.waitForTimeout(600);
}

/**
 * Clicks the top edge of a box.
 *
 * A shape is drawn with a transparent interior, so a click in the middle passes
 * straight through to the page and selects nothing — only the border is hittable.
 */
async function clickEdge(page: Page, box: typeof BLANK_AREA): Promise<void> {
  const bounds = await firstPage(page).boundingBox();
  if (!bounds) throw new Error('page 1 has no bounding box');
  await page.mouse.click(
    bounds.x + bounds.width * ((box.x1 + box.x2) / 2),
    bounds.y + bounds.height * box.y1,
  );
  await page.waitForTimeout(600);
}

const swatchTitle = (page: Page, index: number) =>
  page.locator('.tool-settings.selection .swatch').nth(index).evaluate((node) =>
    node.getAttribute('title') ?? '',
  );

test.describe('editing a mark already on the page', () => {
  test('the selection picker appears only when a mark is selected', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Shape');
    await dragOn(page, BLANK_AREA);
    await putToolDown(page, 'Shape');

    await clickEdge(page, BLANK_AREA);
    await expect(page.locator('.tool-settings.selection')).toBeVisible();

    // Clicking bare page clears the selection, and the picker goes with it.
    await clickInside(page, { x1: 0.85, y1: 0.85, x2: 0.95, y2: 0.95 });
    await expect(page.locator('.tool-settings.selection')).toBeHidden();
  });

  test('recolouring a shape rewrites its colour in the file', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Shape');
    await dragOn(page, BLANK_AREA);
    await save(page);

    const before = (await inspectPdf((await readVirtualFile(page, openPath))!)).annotations.find(
      (item) => item.subtype === 'Square',
    );
    expect(before).toBeDefined();

    await putToolDown(page, 'Shape');
    await clickEdge(page, BLANK_AREA);
    await expect(page.locator('.tool-settings.selection')).toBeVisible();

    const chosen = await swatchTitle(page, 2);
    await page.locator('.tool-settings.selection .swatch').nth(2).click();
    await page.waitForTimeout(600);
    await save(page);

    const after = (await inspectPdf((await readVirtualFile(page, openPath))!)).annotations.find(
      (item) => item.subtype === 'Square',
    );
    expect(after!.color, 'the new colour must be in the file').toBe(chosen.toUpperCase());
    expect(after!.color).not.toBe(before!.color);
  });

  test('changing the width of an existing stroke rewrites it', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Pen');
    await dragOn(page, BLANK_AREA);
    await page.waitForTimeout(INK_SETTLE_MS);
    await save(page);

    const before = (await inspectPdf((await readVirtualFile(page, openPath))!)).annotations.find(
      (item) => item.subtype === 'Ink',
    );

    await putToolDown(page, 'Pen');
    await clickInside(page, BLANK_AREA);
    await expect(page.locator('.tool-settings.selection')).toBeVisible();

    // The last width, which is not the default.
    await page.locator('.tool-settings.selection .width-pick').last().click();
    await page.waitForTimeout(600);
    await save(page);

    const after = (await inspectPdf((await readVirtualFile(page, openPath))!)).annotations.find(
      (item) => item.subtype === 'Ink',
    );
    expect(after!.strokeWidth).toBe(10);
    expect(after!.strokeWidth).not.toBe(before!.strokeWidth);
  });

  test('recolouring a highlight uses the highlight palette, not the pen one', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Highlight');
    await dragOn(page, TITLE_LINE);
    await putToolDown(page, 'Highlight');

    await clickInside(page, TITLE_LINE);
    await expect(page.locator('.tool-settings.selection')).toBeVisible();
    // Highlights have no stroke width to offer.
    await expect(page.locator('.tool-settings.selection .width-pick')).toHaveCount(0);

    const chosen = await swatchTitle(page, 1);
    await page.locator('.tool-settings.selection .swatch').nth(1).click();
    await page.waitForTimeout(600);
    await save(page);

    const highlight = (await inspectPdf((await readVirtualFile(page, openPath))!)).annotations.find(
      (item) => item.subtype === 'Highlight',
    );
    expect(highlight!.color).toBe(chosen.toUpperCase());
  });

  test('an edit to an existing mark counts as unsaved work', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Shape');
    await dragOn(page, BLANK_AREA);
    await save(page);
    await expect(page.locator('.primary-button').last()).toHaveText('Save');

    await putToolDown(page, 'Shape');
    await clickEdge(page, BLANK_AREA);
    await expect(page.locator('.tool-settings.selection')).toBeVisible();
    await page.locator('.tool-settings.selection .swatch').nth(2).click();

    // Otherwise the change could be closed away without a prompt.
    await expect(page.locator('.primary-button').last()).toHaveText(/Save \(\d+\)/);
  });
});
