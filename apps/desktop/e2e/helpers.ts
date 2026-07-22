import { readFile } from 'node:fs/promises';

import { expect, type Locator, type Page } from '@playwright/test';

import { fixturePath, type FixtureName } from './fixtures';
import { installTauriStub } from './tauri-stub';

export const OPEN_PATH = '/virtual/documents/complex.pdf';

export type BootOptions = {
  /** Where the open dialog claims the file lives. */
  openPath?: string;
  /** Where the save dialog points; defaults to the same path (plain overwrite). */
  savePath?: string | null;
  /** How a confirmation prompt is answered. Defaults to backing out. */
  confirmAnswer?: 'ok' | 'cancel';
};

/** Above this, base64 in an init script costs more than an intercepted fetch. */
const INLINE_LIMIT_BYTES = 4 * 1024 * 1024;

/** Loads the app with a fixture already sitting in the stubbed filesystem. */
export async function boot(
  page: Page,
  fixture: FixtureName,
  options: BootOptions = {},
): Promise<{ openPath: string; originalBytes: Buffer }> {
  const openPath = options.openPath ?? OPEN_PATH;
  const originalBytes = await readFile(fixturePath(fixture));
  const inline = originalBytes.length <= INLINE_LIMIT_BYTES;

  if (!inline) {
    const url = `http://fixtures.test/${fixture}`;
    await page.route(url, (route) =>
      route.fulfill({ status: 200, contentType: 'application/pdf', body: originalBytes }),
    );
    await installTauriStub(page, {
      files: {},
      fileUrls: { [openPath]: url },
      openPath,
      savePath: options.savePath === undefined ? openPath : options.savePath,
      confirmAnswer: options.confirmAnswer,
    });
  } else {
    await installTauriStub(page, {
      files: { [openPath]: originalBytes.toString('base64') },
      openPath,
      savePath: options.savePath === undefined ? openPath : options.savePath,
      confirmAnswer: options.confirmAnswer,
    });
  }

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open PDF' })).toBeVisible();
  return { openPath, originalBytes };
}

/** Clicks through the open flow and waits until pages are actually rendered. */
export async function openPdf(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open PDF' }).click();
  await expect(page.locator('.pdf-toolbar')).toBeVisible();
  // Pages render as <img> blobs, not canvases.
  await expect(firstPage(page)).toBeVisible();
}

/** The rendered bitmap of page 1, used as the coordinate origin for drags. */
export function firstPage(page: Page): Locator {
  return page.locator('.pdf-viewport img').first();
}

/**
 * Draws a rectangle annotation by dragging with the Shape tool, which is the
 * closest thing to "a user marked up this PDF" that does not depend on hitting
 * a specific glyph for text selection.
 */
export async function drawShape(
  page: Page,
  /** Fractions of the rendered page, so the drag lands on-page at any zoom. */
  box: { x: number; y: number; width: number; height: number } = {
    x: 0.2,
    y: 0.25,
    width: 0.4,
    height: 0.15,
  },
): Promise<void> {
  const shape = page.getByRole('button', { name: 'Shape', exact: true });
  const bounds = await firstPage(page).boundingBox();
  if (!bounds) throw new Error('page 1 has no bounding box');

  // A freshly drawn annotation stays selected, and while it is, the next drag
  // manipulates it instead of creating a new one. Drop the tool, click bare page
  // to clear the selection, then re-arm. Doing this unconditionally keeps repeat
  // calls deterministic.
  if (await shape.evaluate((node) => node.classList.contains('active'))) {
    await shape.click();
  }
  await page.mouse.click(bounds.x + bounds.width * 0.92, bounds.y + bounds.height * 0.94);
  await shape.click();
  await expect(shape).toHaveClass(/active/);

  const startX = bounds.x + bounds.width * box.x;
  const startY = bounds.y + bounds.height * box.y;
  const endX = startX + bounds.width * box.width;
  const endY = startY + bounds.height * box.height;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Intermediate moves: a single jump is sometimes treated as a click.
  await page.mouse.move((startX + endX) / 2, (startY + endY) / 2, { steps: 8 });
  await page.mouse.move(endX, endY, { steps: 8 });
  await page.mouse.up();
}

/** Number of edits the toolbar believes are unsaved. */
export async function pendingEdits(page: Page): Promise<number> {
  const label = await page.locator('.primary-button').last().textContent();
  const match = label?.match(/Save \((\d+)\)/);
  return match ? Number(match[1]) : 0;
}

export async function save(page: Page): Promise<void> {
  await page.locator('.primary-button').last().click();
  await expect(page.locator('.save-state')).toContainText(/Saved to|Save failed/);
}

export async function saveAs(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save as…' }).click();
  await expect(page.locator('.save-state')).toContainText(/Saved to|Save failed/);
}

export function backupPathFor(path: string): string {
  return path.replace(/\.pdf$/i, '') + '.iroha-original.pdf';
}
