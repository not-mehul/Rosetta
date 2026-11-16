// Errors say what happened, in plain words, and name the files.
import { expect, test } from '@playwright/test';

test('files that can’t be read are named', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  const junk = Buffer.from([0, 1, 2, 3, 0, 255, 0, 7]);
  await chooser.setFiles([
    { name: 'scan-one.bin', mimeType: 'application/octet-stream', buffer: junk },
    { name: 'scan-two.bin', mimeType: 'application/octet-stream', buffer: junk },
  ]);
  await expect(page.locator('#toast')).toContainText('2 files couldn’t be read: scan-one.bin, scan-two.bin.');
});
