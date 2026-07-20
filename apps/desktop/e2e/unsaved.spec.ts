/**
 * Losing work is the failure this app cannot afford.
 *
 * Closing a tab used to call closeDocument straight away, so annotations that had
 * never been saved vanished with no prompt and no trace. These tests pin the guard
 * that stops that, and check the escape hatch still works when the user really does
 * want to throw the edits away.
 */
import { expect, test } from '@playwright/test';

import { boot, drawShape, openPdf, pendingEdits, save } from './helpers';
import { invokeCalls } from './tauri-stub';

const closeTab = (page: import('@playwright/test').Page) =>
  page.locator('.tab-close').first().click();

test.describe('unsaved edits', () => {
  test('closing a tab with unsaved edits asks first, and backing out keeps the work', async ({
    page,
  }) => {
    await boot(page, 'complex.pdf', { confirmAnswer: 'cancel' });
    await openPdf(page);
    await drawShape(page);

    // Drawing emits create then update, so let the count settle before reading it —
    // otherwise the second event can land mid-test and look like a new edit.
    await expect.poll(() => pendingEdits(page)).toBeGreaterThan(0);
    const before = await pendingEdits(page);

    await closeTab(page);
    await page.waitForTimeout(800);

    // The prompt has to have actually been raised, not merely intended.
    const asked = (await invokeCalls(page)).some((call) => call.cmd === 'plugin:dialog|message');
    expect(asked, 'closing with unsaved edits must ask for confirmation').toBe(true);

    // Backing out leaves the document open with the edits intact.
    await expect(page.locator('.pdf-toolbar')).toBeVisible();
    await expect(page.locator('.tab').first()).toBeVisible();
    expect(
      await pendingEdits(page),
      'backing out must not discard the work',
    ).toBeGreaterThanOrEqual(before);
  });

  test('confirming the prompt does close the tab', async ({ page }) => {
    await boot(page, 'complex.pdf', { confirmAnswer: 'ok' });
    await openPdf(page);
    await drawShape(page);

    await closeTab(page);
    await expect(page.locator('.empty-workspace')).toBeVisible();
  });

  test('closing a saved document does not nag', async ({ page }) => {
    await boot(page, 'complex.pdf', { confirmAnswer: 'cancel' });
    await openPdf(page);
    await drawShape(page);
    await save(page);
    expect(await pendingEdits(page)).toBe(0);

    await closeTab(page);

    // Nothing pending, so it should just close.
    await expect(page.locator('.empty-workspace')).toBeVisible();
    const asked = (await invokeCalls(page)).some((call) => call.cmd === 'plugin:dialog|message');
    expect(asked, 'a saved document must close without a prompt').toBe(false);
  });

  test('closing a document with no edits at all does not nag', async ({ page }) => {
    await boot(page, 'complex.pdf', { confirmAnswer: 'cancel' });
    await openPdf(page);

    await closeTab(page);
    await expect(page.locator('.empty-workspace')).toBeVisible();
  });

  test('the window guard is armed only while edits are pending', async ({ page }) => {
    await boot(page, 'complex.pdf', { confirmAnswer: 'cancel' });
    await openPdf(page);

    // beforeunload cannot be observed directly, so check the condition it reads.
    const armedBefore = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(armedBefore, 'nothing pending, so leaving must not be blocked').toBe(false);

    await drawShape(page);
    const armedAfter = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(armedAfter, 'pending edits must block leaving the app').toBe(true);

    await save(page);
    const armedAfterSave = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(armedAfterSave, 'saving must disarm the guard').toBe(false);
  });
});
