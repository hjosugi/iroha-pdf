/**
 * The page organizer (#17, #18): drag to reorder, multi-select, duplicate,
 * delete, rotate, insert a blank page and undo, saved as a new PDF.
 *
 * `rotated-mixed.pdf` again, because every one of its twelve pages is unique by
 * width and rotation — three widths, each at 0, 90, 180 and 270 — so a page that
 * moved, went missing, was copied or was turned shows in the output's shape
 * alone, and the checks below read nothing else.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { boot, nextSavePath, openPdf } from './helpers';
import { readVirtualFile } from './tauri-stub';

const SOURCE = '/virtual/documents/rotated-mixed.pdf';
const OUT = '/virtual/documents/organized.pdf';

/** Each page as `width@rotation`: `595@0` is page 1, `612@90` page 6, `842@270` page 12. */
const ORIGINAL = [
  '595@0', '595@90', '595@180', '595@270',
  '612@0', '612@90', '612@180', '612@270',
  '842@0', '842@90', '842@180', '842@270',
];

async function shape(page: Page, path = OUT): Promise<string[]> {
  const bytes = await readVirtualFile(page, path);
  expect(bytes, `${path} should have been written`).not.toBeNull();
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(new Uint8Array(bytes!));
  return pdf.getPages().map((each) => `${Math.round(each.getWidth())}@${each.getRotation().angle}`);
}

function organizer(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Organize pages' });
}

function tiles(page: Page): Locator {
  return organizer(page).getByRole('option');
}

/** The tile at a one-based position in the new document. */
function tile(page: Page, position: number): Locator {
  return tiles(page).nth(position - 1);
}

async function openOrganizer(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Organize…' }).click();
  await expect(organizer(page)).toBeVisible();
  await expect(tiles(page)).toHaveCount(12);
}

async function saveOrganized(page: Page): Promise<void> {
  await organizer(page).getByRole('button', { name: 'Save as new PDF…' }).click();
  await expect(page.locator('.save-state')).toContainText('Saved organized.pdf');
  await expect(organizer(page)).toBeHidden();
}

/** Drags one tile onto the left or right half of another. */
async function dragTile(from: Locator, onto: Locator, side: 'before' | 'after'): Promise<void> {
  const box = await onto.boundingBox();
  expect(box).not.toBeNull();
  await from.dragTo(onto, {
    targetPosition: { x: side === 'before' ? box!.width * 0.2 : box!.width * 0.8, y: box!.height / 2 },
  });
}

test.describe('page organizer', () => {
  test.beforeEach(async ({ page }) => {
    await boot(page, 'rotated-mixed.pdf', { openPath: SOURCE, savePath: OUT });
    await openPdf(page);
  });

  test('drags a page to a new place and saves that order as a new PDF', async ({ page }) => {
    await openOrganizer(page);
    // Page 1 dropped after page 5.
    await dragTile(tile(page, 1), tile(page, 5), 'after');

    await expect(tile(page, 5)).toHaveAccessibleName('Page 1');
    await saveOrganized(page);
    expect(await shape(page)).toEqual([
      '595@90', '595@180', '595@270', '612@0', '595@0',
      '612@90', '612@180', '612@270', '842@0', '842@90', '842@180', '842@270',
    ]);
  });

  test('moves several selected pages together, in their order', async ({ page }) => {
    await openOrganizer(page);
    await tile(page, 2).click();
    await tile(page, 10).click({ modifiers: ['ControlOrMeta'] });
    await expect(organizer(page).getByRole('status')).toHaveText('12 pages, 2 selected');

    await dragTile(tile(page, 10), tile(page, 1), 'before');
    await saveOrganized(page);
    expect(await shape(page)).toEqual([
      '595@90', '842@90', '595@0', '595@180', '595@270',
      '612@0', '612@90', '612@180', '612@270', '842@0', '842@180', '842@270',
    ]);
  });

  test('duplicates, deletes, rotates and inserts a blank page, with undo', async ({ page }) => {
    await openOrganizer(page);

    // Shift-click selects a range: pages 9 to 12, which are then deleted.
    await tile(page, 9).click();
    await tile(page, 12).click({ modifiers: ['Shift'] });
    await organizer(page).getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(tiles(page)).toHaveCount(8);

    // Page 1 duplicated; the copy lands after it and is what is selected.
    await tile(page, 1).click();
    await organizer(page).getByRole('button', { name: 'Duplicate' }).click();
    await expect(tiles(page)).toHaveCount(9);
    await expect(tile(page, 2)).toHaveAttribute('aria-selected', 'true');

    // The copy turned; the original is not.
    await organizer(page).getByRole('button', { name: 'Rotate right' }).click();
    await expect(tile(page, 2)).toHaveAccessibleName('Page 1, turned 90°');
    await expect(tile(page, 1)).toHaveAccessibleName('Page 1');

    // A blank page after the last one, sized like it.
    await tile(page, 9).click();
    await organizer(page).getByRole('button', { name: 'Insert blank page' }).click();
    await expect(tile(page, 10)).toHaveAccessibleName('Blank page');

    // Undo takes back the blank page and puts it back again.
    await organizer(page).getByRole('button', { name: 'Undo' }).click();
    await expect(tiles(page)).toHaveCount(9);
    await organizer(page).getByRole('button', { name: 'Redo' }).click();
    await expect(tiles(page)).toHaveCount(10);

    await saveOrganized(page);
    expect(await shape(page)).toEqual([
      '595@0', '595@90', '595@90', '595@180', '595@270',
      '612@0', '612@90', '612@180', '612@270',
      // Page 8 is 612 wide and turned 270, so it is seen landscape; the blank
      // page that follows it is the landscape size.
      '792@0',
    ]);
  });

  test('works from the keyboard', async ({ page }) => {
    await openOrganizer(page);
    await tile(page, 1).focus();

    // Space selects; Alt+arrow carries the selection, twice to the right.
    await page.keyboard.press('Space');
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    await expect(tile(page, 3)).toHaveAccessibleName('Page 1');
    await expect(tile(page, 3)).toBeFocused();

    // Ctrl/Cmd+D duplicates, Delete removes, Ctrl/Cmd+Z takes a step back.
    await page.keyboard.press('ControlOrMeta+d');
    await expect(tiles(page)).toHaveCount(13);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(tiles(page)).toHaveCount(12);

    await saveOrganized(page);
    expect(await shape(page)).toEqual(['595@90', '595@180', '595@0', ...ORIGINAL.slice(3)]);
  });

  test('will not delete the last page, and has nothing to save until something changes', async ({ page }) => {
    await openOrganizer(page);
    const save = organizer(page).getByRole('button', { name: 'Save as new PDF…' });
    await expect(save).toBeDisabled();

    await organizer(page).getByRole('button', { name: 'Select all' }).click();
    await expect(organizer(page).getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();

    // Moving a page and moving it back is no change at all.
    await tile(page, 1).click();
    await page.keyboard.press('Alt+ArrowRight');
    await expect(save).toBeEnabled();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(save).toBeDisabled();
  });

  test('leaves the open document alone, and asks before throwing an arrangement away', async ({ page }) => {
    const before = await readVirtualFile(page, SOURCE);
    await openOrganizer(page);
    await tile(page, 1).click();
    await organizer(page).getByRole('button', { name: 'Delete', exact: true }).click();

    // The stub answers the confirmation "cancel" unless told otherwise: the
    // arrangement stays.
    await organizer(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(organizer(page)).toBeVisible();
    await expect(tiles(page)).toHaveCount(11);

    await nextSavePath(page, null);
    await organizer(page).getByRole('button', { name: 'Save as new PDF…' }).click();
    // A dismissed save dialog is a change of mind, not a failure, and the
    // organizer stays open with the arrangement in it.
    await expect(organizer(page)).toBeVisible();
    await expect(tiles(page)).toHaveCount(11);
    expect(await readVirtualFile(page, OUT)).toBeNull();

    expect(await readVirtualFile(page, SOURCE)).toEqual(before);
    await expect(page.locator('.pdf-viewport img').first()).toBeVisible();
  });
});

test.describe('page organizer on a long document', () => {
  /**
   * #18's constraint: 500 pages must not mean 500 renders. The grid has a tile for
   * every page from the start and draws only what is near the view, through the
   * same store as the side panel's strip.
   */
  test('gives a 500-page document 500 tiles and nothing like 500 renders', async ({ page }) => {
    await boot(page, 'heavy.pdf');
    await openPdf(page);
    await page.getByRole('button', { name: 'Organize…' }).click();
    await expect(organizer(page)).toBeVisible();
    await expect(tiles(page)).toHaveCount(500);

    const drawn = () => organizer(page).locator('.organizer-image').count();
    await expect.poll(drawn, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(3000);
    const count = await drawn();
    console.log(`[organizer] ${count} of 500 pages drawn`);
    expect(count, 'a grid that rendered every page would defeat the purpose').toBeLessThan(80);

    // And a move at that size is still one step.
    await tile(page, 1).click();
    await page.keyboard.press('End');
    await tile(page, 500).click({ modifiers: ['Shift'] });
    await expect(organizer(page).getByRole('status')).toHaveText('500 pages, 500 selected');
  });
});
