import { expect, test } from '@playwright/test';

import { boot, openPdf } from './helpers';

test.describe('keyboard and responsive access', () => {
  test('tabs expose separate selectable and close controls without nested buttons', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);

    await expect(page.locator('button button')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'complex.pdf' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Close tab: complex.pdf' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open another PDF' })).toBeVisible();
  });

  test('the print dialog closes with Escape and returns focus to its trigger', async ({ page }) => {
    await boot(page, 'complex.pdf');
    await openPdf(page);

    const trigger = page.getByRole('button', { name: 'Print', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Print PDF' });
    await expect(dialog).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('a narrow window keeps history and notes reachable below the viewer', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 720 });
    await boot(page, 'complex.pdf');
    await openPdf(page);

    await expect(page.locator('.side-panel')).toBeVisible();
    await page.getByRole('tab', { name: 'Note' }).click();
    await expect(page.getByRole('textbox', { name: 'Linked note' })).toBeVisible();
  });
});
