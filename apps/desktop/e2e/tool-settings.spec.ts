/**
 * Colour and width choices must reach the file, not just the toolbar.
 *
 * A picker that changes the preview but writes the default colour would look right and
 * be wrong, and nobody would notice until they opened the PDF somewhere else.
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

test.describe('tool colour and width', () => {
  test('the picker only appears while a tool is in hand', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await expect(page.locator('.tool-settings')).toBeHidden();

    await useTool(page, 'Highlight');
    await expect(page.locator('.tool-settings')).toBeVisible();
    await expect(page.locator('.swatch')).toHaveCount(4);

    // Highlights have no width to pick; pens do.
    await expect(page.locator('.width-pick')).toHaveCount(0);
    await useTool(page, 'Pen');
    await expect(page.locator('.width-pick')).toHaveCount(4);
  });

  test('a chosen highlight colour is the colour written to the file', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await useTool(page, 'Highlight');

    // The third swatch, so a pass cannot come from the default being right.
    await page.locator('.swatch').nth(2).click();
    const chosen = await page.locator('.swatch').nth(2).evaluate((node) => node.getAttribute('title') ?? '');

    await dragOn(page, TITLE_LINE);
    await save(page);

    const saved = await readVirtualFile(page, openPath);
    const highlight = (await inspectPdf(saved!)).annotations.find(
      (item) => item.subtype === 'Highlight',
    );
    expect(highlight, 'the highlight must be in the file').toBeDefined();
    expect(highlight!.color).toBe(chosen.toUpperCase());
  });

  test('a chosen pen colour and width are both written to the file', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await useTool(page, 'Pen');

    await page.locator('.swatch').nth(1).click();
    const chosen = await page.locator('.swatch').nth(1).evaluate((node) => node.getAttribute('title') ?? '');
    // The first width, which differs from the default of 6.
    await page.locator('.width-pick').first().click();

    await dragOn(page, BLANK_AREA);
    await page.waitForTimeout(INK_SETTLE_MS);
    await save(page);

    const saved = await readVirtualFile(page, openPath);
    const ink = (await inspectPdf(saved!)).annotations.find((item) => item.subtype === 'Ink');
    expect(ink, 'the stroke must be in the file').toBeDefined();
    expect(ink!.color).toBe(chosen.toUpperCase());
    expect(ink!.strokeWidth, 'the chosen width must be written').toBe(2);
  });

  test('each tool keeps its own colour', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Highlight');
    await page.locator('.swatch').nth(1).click();
    const highlightColor = await page.locator('.swatch').nth(1).evaluate((n) => n.getAttribute('title') ?? '');
    await dragOn(page, TITLE_LINE);

    await useTool(page, 'Shape');
    await page.locator('.swatch').nth(2).click();
    const shapeColor = await page.locator('.swatch').nth(2).evaluate((n) => n.getAttribute('title') ?? '');
    await dragOn(page, BLANK_AREA);

    await save(page);
    const saved = await readVirtualFile(page, openPath);
    const annotations = (await inspectPdf(saved!)).annotations;

    expect(annotations.find((a) => a.subtype === 'Highlight')?.color).toBe(
      highlightColor.toUpperCase(),
    );
    expect(annotations.find((a) => a.subtype === 'Square')?.color).toBe(shapeColor.toUpperCase());
    expect(highlightColor).not.toBe(shapeColor);
  });

  test('the choice survives a restart', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);
    await useTool(page, 'Pen');
    await page.locator('.swatch').nth(3).click();
    const chosen = await page.locator('.swatch').nth(3).evaluate((node) => node.getAttribute('title') ?? '');

    await page.reload();
    await openPdf(page);
    await useTool(page, 'Pen');

    const active = page.locator('.swatch.active');
    await expect(active).toHaveCount(1);
    expect(await active.evaluate((node) => node.getAttribute('title') ?? '')).toBe(chosen);
  });
});
