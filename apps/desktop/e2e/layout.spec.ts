/**
 * Print layouts (#23): two-up, booklet and poster, checked on the produced file.
 */
import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

import { boot, openPdf } from './helpers';
import { readVirtualFile } from './tauri-stub';

/**
 * Captures the PDF blobs the layout print path hands to its frame, and neutralises
 * the frame's print() so a real dialog cannot open during the run.
 */
async function capturePrintedBlobs(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const blobs: Blob[] = [];
    (globalThis as { __layoutPrintBlobs?: Blob[] }).__layoutPrintBlobs = blobs;
    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (item: Blob | MediaSource) => {
      if (item instanceof Blob && item.type === 'application/pdf') blobs.push(item);
      return originalCreate(item as Blob);
    };
    const originalAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(node: T): T {
      const result = originalAppend.call(this, node) as T;
      if (node instanceof HTMLIFrameElement) {
        node.addEventListener('load', () => {
          try {
            if (node.contentWindow) node.contentWindow.print = () => undefined;
          } catch {
            // Cross-origin frame; nothing to neutralise.
          }
        });
      }
      return result;
    };
  });
}

async function printedPdf(page: import('@playwright/test').Page): Promise<Buffer> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (globalThis as { __layoutPrintBlobs?: Blob[] }).__layoutPrintBlobs?.length ?? 0,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const base64 = await page.evaluate(async () => {
    const blobs = (globalThis as { __layoutPrintBlobs?: Blob[] }).__layoutPrintBlobs ?? [];
    const candidate = blobs.at(-1);
    if (!candidate) return null;
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  });
  expect(base64).not.toBeNull();
  return Buffer.from(base64!, 'base64');
}

async function openLayout(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Layout…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Print layout' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function sizes(page: import('@playwright/test').Page, path: string) {
  const saved = await readVirtualFile(page, path);
  expect(saved).not.toBeNull();
  const pdf = await PDFDocument.load(new Uint8Array(saved!));
  return pdf.getPages().map((source) => source.getSize());
}

test.describe('print layouts', () => {
  test('puts two pages on a landscape sheet', async ({ page }) => {
    const target = '/virtual/documents/two-up.pdf';
    await boot(page, 'complex.pdf', { savePath: target });
    await openPdf(page);

    const dialog = await openLayout(page);
    await dialog.getByLabel('2 pages per sheet').check();
    await dialog.getByRole('button', { name: 'Create and save' }).click();
    await expect(page.locator('.save-state')).toContainText('two-up.pdf');

    const pages = await sizes(page, target);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.width).toBeGreaterThan(pages[0]!.height);
  });

  test('orders a booklet for duplex printing', async ({ page }) => {
    const target = '/virtual/documents/booklet.pdf';
    await boot(page, 'complex.pdf', { savePath: target });
    await openPdf(page);

    const dialog = await openLayout(page);
    await dialog.getByLabel('Saddle-stitch booklet (duplex)').check();
    await dialog.getByRole('button', { name: 'Create and save' }).click();
    await expect(page.locator('.save-state')).toContainText('booklet.pdf');

    // Two source pages pad to four, which is one sheet: a front and a back.
    const pages = await sizes(page, target);
    expect(pages).toHaveLength(2);
    for (const size of pages) expect(size.width).toBeGreaterThan(size.height);
  });

  test('splits a poster into one page per tile', async ({ page }) => {
    const target = '/virtual/documents/poster.pdf';
    await boot(page, 'complex.pdf', { savePath: target });
    await openPdf(page);

    const dialog = await openLayout(page);
    await dialog.getByLabel('Poster tiles').check();
    await dialog.getByRole('button', { name: 'Create and save' }).click();
    await expect(page.locator('.save-state')).toContainText('poster.pdf');

    // Two source pages, two by two tiles each.
    const pages = await sizes(page, target);
    expect(pages).toHaveLength(8);
  });
});


test('sends the produced layout to the print path', async ({ page }) => {
  await capturePrintedBlobs(page);
  const target = '/virtual/documents/two-up-print.pdf';
  await boot(page, 'complex.pdf', { savePath: target });
  await openPdf(page);

  const dialog = await openLayout(page);
  await dialog.getByLabel('2 pages per sheet').check();
  await dialog.getByRole('button', { name: 'Create and print' }).click();
  await expect(page.locator('.save-state')).toContainText('two-up-print.pdf');

  const printed = await PDFDocument.load(new Uint8Array(await printedPdf(page)));
  expect(printed.getPageCount()).toBe(1);
});
