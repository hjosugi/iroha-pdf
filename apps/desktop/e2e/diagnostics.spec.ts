/**
 * The opt-in diagnostics log (#66).
 *
 * The point of the feature is that a user can see what would leave the device, so
 * this walks the whole surface: off by default, enable, export, delete, close. The
 * header button is present on the empty workspace, so no document is opened.
 */
import { expect, test } from '@playwright/test';

import { boot } from './helpers';

test('the diagnostics log is opt-in, exportable and deletable', async ({ page }) => {
  await boot(page, 'complex.pdf');

  await page.getByRole('button', { name: 'Diagnostics' }).click();
  const dialog = page.getByRole('dialog', { name: 'Diagnostics' });
  await expect(dialog).toBeVisible();

  // Off until asked for: nothing recorded, and the export is empty.
  await expect(dialog.getByText('Nothing recorded yet.')).toBeVisible();

  await dialog.getByRole('checkbox', { name: 'Enable diagnostics' }).check();
  await expect(dialog.getByText('Enabled. Only fixed codes')).toBeVisible();

  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export' }).click();
  expect((await download).suggestedFilename()).toBe('iroha-pdf-diagnostics.json');

  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(dialog.getByText('Nothing recorded yet.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
});
