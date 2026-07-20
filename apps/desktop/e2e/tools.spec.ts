/**
 * The tools people actually reach for.
 *
 * Every other suite drives the Shape tool because a rectangle drag is the easiest
 * thing to automate. But the reason this app exists is "I want to highlight a line and
 * write a note without paying for it", and highlighting runs through text selection
 * while a note runs through text entry — different code paths that had never been
 * exercised.
 */
import { expect, test, type Page } from '@playwright/test';

import { boot, firstPage, openPdf, pendingEdits, save } from './helpers';
import { inspectPdf } from './inspect';
import { readVirtualFile } from './tauri-stub';

/** Fractions of the rendered page. The title line sits near the top of the fixture. */
const TITLE_LINE = { x1: 0.1, y1: 0.088, x2: 0.45, y2: 0.088 };
const BLANK_AREA = { x1: 0.2, y1: 0.6, x2: 0.55, y2: 0.72 };

async function useTool(page: Page, label: string): Promise<void> {
  const button = page.getByRole('button', { name: label, exact: true });
  if (!(await button.evaluate((node) => node.classList.contains('active')))) {
    await button.click();
  }
  await expect(button).toHaveClass(/active/);
}

async function dragOn(
  page: Page,
  box: { x1: number; y1: number; x2: number; y2: number },
): Promise<void> {
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

/** The pen holds a finished stroke for ~800 ms before it becomes an annotation. */
const INK_SETTLE_MS = 1000;

async function savedSubtypes(page: Page, openPath: string): Promise<string[]> {
  const saved = await readVirtualFile(page, openPath);
  expect(saved).not.toBeNull();
  return (await inspectPdf(saved!)).annotationSubtypes.flat();
}

test.describe('annotation tools', () => {
  test('highlighting a line of text produces a Highlight in the file', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Highlight');
    await dragOn(page, TITLE_LINE);
    expect(await pendingEdits(page), 'the highlight must register as an edit').toBeGreaterThan(0);

    await save(page);
    expect(await savedSubtypes(page, openPath)).toContain('Highlight');
  });

  test('a pen stroke produces an Ink annotation', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Pen');
    await dragOn(page, BLANK_AREA);
    await page.waitForTimeout(INK_SETTLE_MS);
    expect(await pendingEdits(page), 'the stroke must register as an edit').toBeGreaterThan(0);

    await save(page);
    expect(await savedSubtypes(page, openPath)).toContain('Ink');
  });

  test('a written note produces a FreeText annotation', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Text');
    await dragOn(page, BLANK_AREA);
    await page.keyboard.type('check this figure');
    await page.waitForTimeout(400);
    // Click away so the box is committed rather than left in edit mode.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(400);

    await save(page);
    expect(await savedSubtypes(page, openPath)).toContain('FreeText');
  });

  test('a shape produces a Square annotation', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Shape');
    await dragOn(page, BLANK_AREA);

    await save(page);
    expect(await savedSubtypes(page, openPath)).toContain('Square');
  });

  test('several kinds of mark can coexist in one save', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Highlight');
    await dragOn(page, TITLE_LINE);

    await useTool(page, 'Pen');
    await dragOn(page, { x1: 0.2, y1: 0.62, x2: 0.5, y2: 0.7 });
    await page.waitForTimeout(INK_SETTLE_MS);

    await useTool(page, 'Shape');
    await dragOn(page, { x1: 0.55, y1: 0.6, x2: 0.8, y2: 0.72 });

    await save(page);
    const subtypes = await savedSubtypes(page, openPath);
    expect(subtypes).toContain('Highlight');
    expect(subtypes).toContain('Ink');
    expect(subtypes).toContain('Square');
  });

  test('a mark can be removed again before saving', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Shape');
    await dragOn(page, BLANK_AREA);

    // Drawing leaves the new annotation selected, so Delete should remove it.
    await page.keyboard.press('Delete');
    await page.waitForTimeout(600);

    await save(page);
    const subtypes = await savedSubtypes(page, openPath);
    expect(subtypes, 'the deleted mark must not be in the file').toEqual([]);

    const saved = await readVirtualFile(page, openPath);
    expect(
      (await inspectPdf(saved!)).pageCount,
      'deleting an annotation must not disturb the document',
    ).toBe((await inspectPdf(originalBytes)).pageCount);
  });

  test('saving immediately after a pen stroke still keeps the stroke', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Pen');
    await dragOn(page, BLANK_AREA);

    // No settle time. The pen defers its commit by ~800 ms, and saving inside that
    // window used to write a file with no stroke in it while reporting success —
    // the user draws, saves, is told it worked, and the work is gone.
    await save(page);
    expect(
      await savedSubtypes(page, openPath),
      'a stroke saved before the commit delay elapsed must still be in the file',
    ).toContain('Ink');
  });

  test('undo takes a mark back, redo puts it again', async ({ page }) => {
    const { openPath } = await boot(page, 'complex.pdf');
    await openPdf(page);

    await useTool(page, 'Shape');
    await dragOn(page, BLANK_AREA);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.waitForTimeout(600);
    await save(page);
    expect(await savedSubtypes(page, openPath), 'undo must remove the mark').toEqual([]);

    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await page.waitForTimeout(600);
    await save(page);
    expect(await savedSubtypes(page, openPath), 'redo must bring it back').toContain('Square');
  });
});
