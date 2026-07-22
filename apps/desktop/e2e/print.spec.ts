/**
 * Printing.
 *
 * Print is the other way a marked-up PDF leaves this app, and it had never been
 * exercised at all. The native print dialog blocks automation, so instead of driving
 * it these tests capture the document the plugin hands to the print frame — which is
 * exactly the bytes that would reach the printer — and read it back.
 */
import { expect, test, type Page } from '@playwright/test';

import { boot, drawShape, openPdf } from './helpers';
import { inspectPdf } from './inspect';

/**
 * Records every Blob turned into an object URL, and neutralises `print()` on both the
 * page and any frame it creates, so a real dialog can never open and strand the run.
 */
async function capturePrintDocuments(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const blobs: Blob[] = [];
    (globalThis as { __printBlobs?: Blob[] }).__printBlobs = blobs;

    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (item: Blob | MediaSource) => {
      if (item instanceof Blob) blobs.push(item);
      return originalCreate(item as Blob);
    };

    let printCalls = 0;
    Object.defineProperty(globalThis, '__printCalls', { get: () => printCalls });
    window.print = () => {
      printCalls += 1;
    };
    // The print frame calls print() on its own window, which is a different object.
    const originalAppend = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(node: T): T {
      const result = originalAppend.call(this, node) as T;
      if (node instanceof HTMLIFrameElement) {
        node.addEventListener('load', () => {
          try {
            if (node.contentWindow) {
              node.contentWindow.print = () => {
                printCalls += 1;
              };
            }
          } catch {
            // Cross-origin frame; nothing to neutralise.
          }
        });
      }
      return result;
    };
  });
}

/**
 * Reads back the most recent PDF blob.
 *
 * Filtering by size alone picks up the rendered page bitmaps, which are also blobs and
 * are far more numerous; only the MIME type distinguishes the print document.
 */
async function printedDocument(page: Page): Promise<Buffer | null> {
  const base64 = await page.evaluate(async () => {
    const blobs = (globalThis as { __printBlobs?: Blob[] }).__printBlobs ?? [];
    const pdfs = blobs.filter((blob) => blob.type === 'application/pdf');
    const candidate = pdfs.at(-1);
    if (!candidate) return null;
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  });
  return base64 === null ? null : Buffer.from(base64, 'base64');
}

async function openPrintPreview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Print PDF' })).toBeVisible();
  await page.getByRole('button', { name: 'Open print preview' }).click();
}

test.describe('printing', () => {
  test('printing prepares a real PDF of the document', async ({ page }) => {
    await capturePrintDocuments(page);
    const { originalBytes } = await boot(page, 'complex.pdf');
    await page.goto('/');
    await openPdf(page);

    await openPrintPreview(page);
    await expect
      .poll(async () => (await printedDocument(page))?.length ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(1000);

    const printed = await printedDocument(page);
    expect(printed!.subarray(0, 5).toString('latin1'), 'must be a PDF').toBe('%PDF-');

    const facts = await inspectPdf(printed!);
    const original = await inspectPdf(originalBytes);
    expect(facts.pageCount, 'every page must be printed').toBe(original.pageCount);
    expect(facts.imageCount, 'images must survive into the print copy').toBe(original.imageCount);
  });

  test('annotations are included in what gets printed', async ({ page }) => {
    await capturePrintDocuments(page);
    await boot(page, 'complex.pdf');
    await page.goto('/');
    await openPdf(page);

    await drawShape(page);

    await openPrintPreview(page);
    await expect
      .poll(async () => (await printedDocument(page))?.length ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(1000);

    const printed = await printedDocument(page);
    const facts = await inspectPdf(printed!);
    // The toolbar prints with includeAnnotations: true, so the mark has to be there —
    // printing a copy without the notes you just made would be quietly useless.
    expect(
      facts.annotationSubtypes.flat().length,
      'the annotation must be in the printed document',
    ).toBeGreaterThan(0);
  });

  test('printing does not alter the document being edited', async ({ page }) => {
    await capturePrintDocuments(page);
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await page.goto('/');
    await openPdf(page);

    await openPrintPreview(page);
    await expect
      .poll(async () => (await printedDocument(page))?.length ?? 0, { timeout: 30_000 })
      .toBeGreaterThan(1000);

    // Printing is a read: the file on disk must be untouched and nothing marked unsaved.
    const { readVirtualFile } = await import('./tauri-stub');
    const onDisk = await readVirtualFile(page, openPath);
    expect(onDisk!.equals(originalBytes)).toBe(true);
    await expect(page.locator('.primary-button').last()).toHaveText('Save');
  });
});
