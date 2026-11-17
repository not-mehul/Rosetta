// Small UI fixes, as the reader sees them.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('unopened books carry no "New" chip, and read aloud without a voice says what to do', async ({ page }) => {
  // A browser whose speech engine has no voice: every utterance fails the way Chromium's does.
  await page.addInitScript(() => {
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      setTimeout(() => u.onerror?.(Object.assign(new Event('error'), { error: 'synthesis-failed' }) as SpeechSynthesisErrorEvent), 10);
    };
  });
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles([fixture('garden.md'), fixture('tide.txt')]);
  await expect(page.locator('.doc-card')).toHaveCount(2);
  await expect(page.locator('.doc-card .chip-status')).toHaveCount(0);

  await page.getByRole('button', { name: /^Garden Diary/ }).click();
  await page.click('#openType');
  await page.click('#panel-listen');
  await page.click('#readAloud');
  await expect(page.locator('#toast')).toContainText('text-to-speech');
  await expect(page.locator('#toast')).not.toContainText('[object');
});
