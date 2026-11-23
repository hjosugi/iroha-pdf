/**
 * Filling an AcroForm on the desktop (#48).
 *
 * `packages/core/src/forms.ts` could already read and fill a form; mobile had the
 * screen and desktop had only the promise of one. This drives the real dialog and
 * checks the saved copy, not just that a button exists.
 */
import { expect, test } from '@playwright/test';
import { readPdfForm } from '@iroha-pdf/core';

import { FORM_FIELDS } from './fixtures';
import { boot, openPdf } from './helpers';
import { readVirtualFile } from './tauri-stub';

test.describe('filling a PDF form', () => {
  test('writes the answers into a new copy', async ({ page }) => {
    const openPath = '/virtual/documents/form.pdf';
    const target = '/virtual/documents/form-filled.pdf';
    await boot(page, 'form.pdf', { openPath, savePath: target });
    await openPdf(page);

    await page.getByRole('button', { name: 'Fill form…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Fill form' });
    await expect(dialog).toBeVisible();

    await dialog.locator('input[type="text"]').fill('Grace Hopper');
    await dialog.locator('select').selectOption('Design');
    // The fixture ships this one checked; unchecking it is a real answer too.
    await dialog.locator('input[type="checkbox"]').uncheck();

    await dialog.getByRole('button', { name: 'Fill and save' }).click();
    await expect(page.locator('.save-state')).toContainText('form-filled.pdf');

    const saved = await readVirtualFile(page, target);
    expect(saved).not.toBeNull();
    const form = await readPdfForm(new Uint8Array(saved!));
    const values = Object.fromEntries(form.fields.map((field) => [field.name, field.value]));
    expect(values[FORM_FIELDS.name]).toBe('Grace Hopper');
    // pdf-lib reports a dropdown selection as a one-item list.
    expect(values[FORM_FIELDS.department]).toEqual(['Design']);
    expect(values[FORM_FIELDS.approved]).toBe(false);
  });

  test('says so when there is no form to fill', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);

    await page.getByRole('button', { name: 'Fill form…' }).click();
    await expect(page.locator('.save-state')).toContainText('no fillable form fields');
  });
});
