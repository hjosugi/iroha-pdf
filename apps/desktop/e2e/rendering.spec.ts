/**
 * Does the annotation actually show up for someone who is not using this app?
 *
 * The editing suite proves the mark is in /Annots. That is a structural claim. These
 * tests rasterise the saved file with poppler and Ghostscript — neither shares code
 * with pdfium — and check that something visibly changed, in the right place, and
 * nowhere else.
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { boot, drawShape, openPdf, save } from './helpers';
import { diffBox, imageSize, renderGhostscript, renderPoppler, RENDERERS } from './render';
import { readVirtualFile } from './tauri-stub';

/** The drag used below, as fractions of the page. */
const DRAWN = { x: 0.2, y: 0.25, width: 0.45, height: 0.2 };

/** Rasterisers place edges slightly differently; the stroke also has width. */
const TOLERANCE_PX = 18;

test.describe('the annotation is visible outside pdfium', () => {
  test.skip(
    !RENDERERS.imagemagick || (!RENDERERS.poppler && !RENDERERS.ghostscript),
    'needs ImageMagick plus poppler or Ghostscript',
  );

  test('poppler and Ghostscript both draw the mark where it was drawn', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);
    await drawShape(page, {
      x: DRAWN.x,
      y: DRAWN.y,
      width: DRAWN.width,
      height: DRAWN.height,
    });
    await save(page);

    const saved = await readVirtualFile(page, openPath);
    expect(saved).not.toBeNull();

    const directory = await mkdtemp(join(tmpdir(), 'iroha-render-'));
    const beforePdf = join(directory, 'before.pdf');
    const afterPdf = join(directory, 'after.pdf');
    await writeFile(beforePdf, originalBytes);
    await writeFile(afterPdf, saved!);

    const engines: Array<{ name: string; before: string | null; after: string | null }> = [];
    if (RENDERERS.poppler) {
      engines.push({
        name: 'poppler',
        before: renderPoppler(beforePdf, join(directory, 'pop-before')),
        after: renderPoppler(afterPdf, join(directory, 'pop-after')),
      });
    }
    if (RENDERERS.ghostscript) {
      engines.push({
        name: 'ghostscript',
        before: renderGhostscript(beforePdf, join(directory, 'gs-before.png')),
        after: renderGhostscript(afterPdf, join(directory, 'gs-after.png')),
      });
    }

    expect(engines.length, 'at least one independent renderer must be available').toBeGreaterThan(0);

    for (const engine of engines) {
      expect(engine.before, `${engine.name} rendered the original`).not.toBeNull();
      expect(engine.after, `${engine.name} rendered the saved file`).not.toBeNull();

      const box = diffBox(engine.before!, engine.after!);
      expect(box, `${engine.name} must show a visible difference after annotating`).not.toBeNull();

      const { width: canvasWidth, height: canvasHeight } = imageSize(engine.after!);
      const expected = {
        x: DRAWN.x * canvasWidth,
        y: DRAWN.y * canvasHeight,
        width: DRAWN.width * canvasWidth,
        height: DRAWN.height * canvasHeight,
      };

      console.log(
        `[render] ${engine.name}: diff ${box!.width}x${box!.height}+${box!.x}+${box!.y}` +
          ` (expected ~${Math.round(expected.width)}x${Math.round(expected.height)}` +
          `+${Math.round(expected.x)}+${Math.round(expected.y)})`,
      );

      expect(Math.abs(box!.x - expected.x), `${engine.name} left edge`).toBeLessThan(TOLERANCE_PX);
      expect(Math.abs(box!.y - expected.y), `${engine.name} top edge`).toBeLessThan(TOLERANCE_PX);
      expect(Math.abs(box!.width - expected.width), `${engine.name} width`).toBeLessThan(TOLERANCE_PX);
      expect(Math.abs(box!.height - expected.height), `${engine.name} height`).toBeLessThan(
        TOLERANCE_PX,
      );
    }
  });

  test('saving without annotating changes nothing on the page', async ({ page }) => {
    const { openPath, originalBytes } = await boot(page, 'complex.pdf');
    await openPdf(page);
    // No edit at all, straight to save.
    await save(page);

    const saved = await readVirtualFile(page, openPath);
    const directory = await mkdtemp(join(tmpdir(), 'iroha-render-'));
    const beforePdf = join(directory, 'before.pdf');
    const afterPdf = join(directory, 'after.pdf');
    await writeFile(beforePdf, originalBytes);
    await writeFile(afterPdf, saved!);

    const before = RENDERERS.poppler
      ? renderPoppler(beforePdf, join(directory, 'pop-before'))
      : renderGhostscript(beforePdf, join(directory, 'gs-before.png'));
    const after = RENDERERS.poppler
      ? renderPoppler(afterPdf, join(directory, 'pop-after'))
      : renderGhostscript(afterPdf, join(directory, 'gs-after.png'));

    // A re-save must not shift text, drop the image, or otherwise repaint the page.
    expect(diffBox(before!, after!), 'a no-op save must be visually identical').toBeNull();
  });
});
