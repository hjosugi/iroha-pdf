/**
 * Printing.
 *
 * Print is the other way a marked-up PDF leaves this app, and it had never been
 * exercised at all. The native print dialog blocks automation, so instead of driving
 * it these tests capture the document the plugin hands to the print frame — which is
 * exactly the bytes that would reach the printer — and read it back.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { boot, drawShape, openPdf } from './helpers';
import { extractText, inspectPdf } from './inspect';

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

/** Waits for the print document to appear and hands it back. */
async function printedPdf(page: Page): Promise<Buffer> {
  await expect
    .poll(async () => (await printedDocument(page))?.length ?? 0, { timeout: 30_000 })
    .toBeGreaterThan(1000);
  const printed = await printedDocument(page);
  expect(printed).not.toBeNull();
  return printed!;
}

/** Text of the print document, or null where poppler is not installed. */
async function printedText(printed: Buffer): Promise<string | null> {
  const directory = await mkdtemp(join(tmpdir(), 'iroha-print-'));
  const path = join(directory, 'printed.pdf');
  await writeFile(path, printed);
  return extractText(path);
}

/**
 * Which of the dialog's options to change before asking for the preview.
 *
 * Anything left out keeps whatever the dialog opens with — All pages, annotations on —
 * which is what the older tests assume.
 */
type PrintChoices = {
  pages?: 'current' | { range: string };
  includeAnnotations?: boolean;
};

async function openPrintPreview(page: Page, choices: PrintChoices = {}): Promise<void> {
  await page.getByRole('button', { name: 'Print', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Print PDF' });
  await expect(dialog).toBeVisible();

  if (choices.pages === 'current') {
    // The label carries the page number, so it cannot be matched exactly.
    await dialog.getByRole('radio', { name: /^Current page/ }).check();
  } else if (choices.pages) {
    await dialog.getByRole('radio', { name: 'Range', exact: true }).check();
    await dialog.getByLabel('Page range').fill(choices.pages.range);
  }

  if (choices.includeAnnotations === false) {
    await dialog.getByRole('checkbox', { name: 'Include annotations' }).uncheck();
  }

  await page.getByRole('button', { name: 'Open print preview' }).click();
}

/** Scrolls the viewer to the bottom, which is how the current page is moved on. */
async function scrollToEnd(page: Page): Promise<void> {
  await page.locator('.pdf-viewport').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
}

test.describe('printing', () => {
  test('printing prepares a real PDF of the document', async ({ page }) => {
    await capturePrintDocuments(page);
    const { originalBytes } = await boot(page, 'complex.pdf');
    await page.goto('/');
    await openPdf(page);

    await openPrintPreview(page);
    const printed = await printedPdf(page);
    expect(printed.subarray(0, 5).toString('latin1'), 'must be a PDF').toBe('%PDF-');

    const facts = await inspectPdf(printed);
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
    const printed = await printedPdf(page);
    const facts = await inspectPdf(printed);
    // The toolbar prints with includeAnnotations: true, so the mark has to be there —
    // printing a copy without the notes you just made would be quietly useless.
    expect(
      facts.annotationSubtypes.flat().length,
      'the annotation must be in the printed document',
    ).toBeGreaterThan(0);
  });

  test('unticking Include annotations leaves the marks out', async ({ page }) => {
    await capturePrintDocuments(page);
    const { originalBytes } = await boot(page, 'complex.pdf');
    await page.goto('/');
    await openPdf(page);

    await drawShape(page);

    await openPrintPreview(page, { includeAnnotations: false });
    const printed = await printedPdf(page);

    const facts = await inspectPdf(printed);
    const original = await inspectPdf(originalBytes);
    // The other half of the option: someone printing a clean copy to hand out must not
    // get their working notes on it.
    expect(
      facts.annotationSubtypes.flat(),
      'no annotation may reach a copy printed with the box unticked',
    ).toEqual([]);
    // ...and unticking it must drop the marks, not the document.
    expect(facts.pageCount, 'the whole document must still be printed').toBe(
      original.pageCount,
    );
    expect(facts.imageCount, 'page content must survive').toBe(original.imageCount);
  });

  test('Current page prints one page, and it is the page on screen', async ({ page }) => {
    await capturePrintDocuments(page);
    await boot(page, 'complex.pdf');
    await page.goto('/');
    await openPdf(page);

    // Page 2 so the assertion cannot be satisfied by a viewer that always prints the
    // first page — "current page" that means "page 1" is not the feature.
    await scrollToEnd(page);
    await page.getByRole('button', { name: 'Print', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Print PDF' });
    await expect(
      dialog.getByRole('radio', { name: /^Current page/ }),
      'the viewer must have moved on to page 2',
    ).toHaveAccessibleName('Current page (2)');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await openPrintPreview(page, { pages: 'current' });
    const printed = await printedPdf(page);

    const facts = await inspectPdf(printed);
    expect(facts.pageCount, 'only the current page may be printed').toBe(1);

    // Which page it is, checked with an engine that is not the one that wrote the file.
    // Left out rather than failing where poppler is absent (Windows CI), the same way
    // editing.spec.ts does it; the page count above still holds everywhere.
    const text = await printedText(printed);
    if (text !== null) {
      expect(text, 'the printed page must be the appendix, page 2').toContain('付録');
      expect(text, 'page 1 must not be printed').not.toContain('四半期報告書');
    }
  });

  test('a page range prints exactly the pages it names', async ({ page }) => {
    await capturePrintDocuments(page);
    await boot(page, 'heavy.pdf', { openPath: '/virtual/documents/heavy.pdf' });
    await page.goto('/');
    await openPdf(page);

    await openPrintPreview(page, { pages: { range: '1,3' } });
    const printed = await printedPdf(page);

    const facts = await inspectPdf(printed);
    // Two pages, not the 500 in the document and not the three a comma read as a dash
    // would produce.
    expect(facts.pageCount, '1,3 must print two pages').toBe(2);

    // heavy.pdf numbers its own pages, so the text says which two they are.
    const text = await printedText(printed);
    if (text !== null) {
      expect(text, 'page 1 must be printed').toContain('Page 1 of 500');
      expect(text, 'page 3 must be printed').toContain('Page 3 of 500');
      expect(text, 'page 2 was not asked for').not.toContain('Page 2 of 500');
    }
  });

  test('printing does not alter the document being edited', async ({ page }) => {
    await capturePrintDocuments(page);
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await page.goto('/');
    await openPdf(page);

    await openPrintPreview(page);
    await printedPdf(page);

    // Printing is a read: the file on disk must be untouched and nothing marked unsaved.
    const { readVirtualFile } = await import('./tauri-stub');
    const onDisk = await readVirtualFile(page, openPath);
    expect(onDisk!.equals(originalBytes)).toBe(true);
    await expect(page.locator('.primary-button').last()).toHaveText('Save');
  });
});
