/**
 * The kinds of PDF that are not simply "a document".
 *
 * docs/TEST_PLAN.md's required fixture set names an encrypted PDF, a malformed but
 * repairable one and a form, and none of the three had ever been built, let alone
 * opened. They matter because each one fails differently: a file that needs a password
 * must say so, a file whose index is wrong should still be recoverable rather than
 * thrown away, and a form must not lose its fields on the way through an editor.
 *
 * Two of these record a capability. The encrypted one records the absence of one, on
 * purpose — see the comment on that test.
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { ENCRYPTION_TOOL, FORM_FIELDS, fixturePath } from './fixtures';
import { boot, drawShape, openPdf, save } from './helpers';
import { extractText, inspectPdf } from './inspect';
import { installTauriStub, readVirtualFile } from './tauri-stub';

/** Text of a PDF held in memory, or null where poppler is not installed. */
async function textOf(bytes: Buffer | Uint8Array): Promise<string | null> {
  const directory = await mkdtemp(join(tmpdir(), 'iroha-difficult-'));
  const path = join(directory, 'document.pdf');
  await writeFile(path, bytes);
  return extractText(path);
}

test.describe('an encrypted PDF', () => {
  // Built by Ghostscript or qpdf — pdf-lib cannot write encryption — so on a machine
  // with neither, and on Windows CI where neither is installed, the fixture does not
  // exist and there is nothing to open.
  test.skip(!ENCRYPTION_TOOL, 'needs Ghostscript or qpdf to build encrypted.pdf');

  test('is refused in a way the user can see, not silently or forever', async ({ page }) => {
    const path = '/virtual/documents/encrypted.pdf';
    const bytes = await readFile(fixturePath('encrypted.pdf'));
    await installTauriStub(page, {
      files: { [path]: bytes.toString('base64') },
      openPath: path,
      savePath: path,
    });

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.getByRole('button', { name: 'Open PDF' }).click();
    await page.waitForTimeout(8000);

    const state = await page.evaluate(() => ({
      shown: document.body.innerText,
      toolbar: !!document.querySelector('.pdf-toolbar'),
      pages: document.querySelectorAll('.pdf-viewport img').length,
    }));
    console.log(`[difficult] encrypted page errors: ${JSON.stringify(errors)}`);

    expect(state.shown, 'the failure must be visible to the user').toContain(
      'could not be opened',
    );
    // Editing tools on a document the engine never opened only lead to errors.
    expect(
      state.toolbar === false || state.pages > 0,
      'editing tools were offered for a document that failed to open',
    ).toBe(true);
    // docs/ISSUES 050: technical errors must not be put in front of the user.
    for (const leak of ['Task rejected', '"code":', 'undefined']) {
      expect(state.shown, `the UI must not show ${leak}`).not.toContain(leak);
    }
    // The app must still be usable afterwards.
    await expect(page.getByRole('button', { name: /Open (another )?PDF|\+/ }).first()).toBeVisible();

    // The half of the fixture story that is NOT covered, pinned here so it cannot be
    // mistaken for coverage: desktop has no password prompt, so a PDF the user has the
    // password for is still unopenable here. Mobile has its own native prompt and gate.
    expect(
      state.shown.toLowerCase(),
      'desktop has no password prompt yet; update this test when one does',
    ).not.toContain('password');
  });
});

test.describe('a malformed but repairable PDF', () => {
  test('opens, instead of being thrown away with the genuinely broken ones', async ({ page }) => {
    const path = '/virtual/documents/repairable.pdf';
    const { originalBytes } = await boot(page, 'repairable.pdf', { openPath: path });

    // Its cross-reference table is wrong, so a reader that trusts the index sees
    // nothing. Every object body is intact, and poppler and qpdf both recover the
    // document from them; refusing it would lose a file that was never really lost.
    await openPdf(page);

    const pages = page.locator('.pdf-viewport img');
    await expect(pages.first()).toBeVisible();

    const text = await textOf(originalBytes);
    if (text !== null) {
      expect(text, 'the fixture must really be recoverable, or it proves nothing').toContain(
        'Repairable page 3 of 3',
      );
    }
  });

  test('survives an annotate-and-save round trip with every page intact', async ({ page }) => {
    const path = '/virtual/documents/repairable.pdf';
    await boot(page, 'repairable.pdf', { openPath: path });
    await openPdf(page);

    await drawShape(page);
    await save(page);

    const saved = await readVirtualFile(page, path);
    expect(saved, 'the app must have written to the opened path').not.toBeNull();

    const facts = await inspectPdf(saved!);
    // Repairing must recover the whole document, not the first page it could parse.
    expect(facts.pageCount, 'all three pages must come back').toBe(3);
    expect(facts.annotationSubtypes[0], 'the mark must land on the page it was drawn on')
      .toContain('Square');

    // Note what this does not claim. The save is an incremental update appended to the
    // bytes that were opened, so the wrong cross-reference table is still in the file
    // and poppler still reports it as damaged — it simply rebuilds again. qpdf calls
    // the result clean and all three pages come back, so nothing is lost, but the app
    // is passing the damage on rather than writing a repaired file.
    const text = await textOf(saved!);
    if (text !== null) {
      for (const pageNumber of [1, 2, 3]) {
        const line = `Repairable page ${pageNumber} of 3`;
        expect(text, `${line} must survive the repair and the save`).toContain(line);
      }
    }
  });
});

test.describe('a form PDF', () => {
  test('keeps its fields, and their values, through an annotate-and-save', async ({ page }) => {
    const path = '/virtual/documents/form.pdf';
    const { originalBytes } = await boot(page, 'form.pdf', { openPath: path });
    await openPdf(page);

    // Spelled out rather than compared before-to-after: two empty forms are equal, and
    // a save that dropped the lot would sail through such a comparison.
    const filledIn = {
      [FORM_FIELDS.name]: 'Ada Lovelace',
      [FORM_FIELDS.department]: 'Engineering',
      [FORM_FIELDS.approved]: 'Yes',
    };
    const before = await inspectPdf(originalBytes);
    expect(before.formFields, 'the fixture must carry a filled-in form').toEqual(filledIn);

    await drawShape(page);
    await save(page);

    const saved = await readVirtualFile(page, path);
    expect(saved).not.toBeNull();

    const after = await inspectPdf(saved!);
    // Annotating a form and saving it must not quietly empty the form: someone who
    // marks up a claim form and sends it on would be sending a blank one.
    expect(after.formFields, 'every field and value must survive the save').toEqual(filledIn);
    expect(
      after.annotationSubtypes[0]?.filter((subtype) => subtype === 'Widget').length,
      'each field must still have its widget on the page',
    ).toBe(3);
    expect(
      after.annotationSubtypes[0],
      'and the new mark must be there alongside them',
    ).toContain('Square');
  });
});
