// Files that used to be refused: a locked PDF, and text in older encodings.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('a locked PDF is added, asks for its password once, then shows its title and cover', async ({ page }) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('harbour-locked.pdf'));

  // A single file opens straight away, and asks.
  await expect(page.locator('#promptInput')).toBeVisible();
  await page.fill('#promptInput', 'wrong');
  await page.click('#promptAction');
  await expect(page.locator('.prompt-modal, dialog[open]')).toContainText('didn’t open');
  await page.fill('#promptInput', 'harbour');
  await page.click('#promptAction');
  await expect(page.locator('.pdf-page')).toHaveCount(3);
  await expect(page.locator('.textLayer').first()).toContainText('lighthouses');
  await expect(page.locator('.reader-title')).toHaveText('Harbour Charts');

  // Back in the library: its own title and a cover; opening again doesn't ask.
  await page.click('#closeReader');
  const card = page.locator('.doc-card', { hasText: 'Harbour Charts' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('img')).toHaveCount(1);
  await card.getByRole('button', { name: /^Harbour Charts/ }).click();
  await expect(page.locator('.pdf-page')).toHaveCount(3);
  await expect(page.locator('#promptInput')).toHaveCount(0);
});

test('text in Windows-1252 and UTF-16 is added and read', async ({ page }) => {
  const latin = Buffer.from('Caf\xe9 notes\n\nNa\xefve r\xe9sum\xe9 of the harbour.\n', 'latin1');
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Tide tables\r\n\r\nHigh water at six — and again at half past six.', 'utf16le')]);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles([
    { name: 'cafe.txt', mimeType: 'text/plain', buffer: latin },
    { name: 'tides.txt', mimeType: 'text/plain', buffer: utf16 },
  ]);
  await expect(page.locator('#toast')).toContainText('Added 2 documents');
  await page.getByRole('button', { name: /^Cafe/ }).click();
  await expect(page.locator('.reading')).toContainText('Naïve résumé');
  await page.click('#closeReader');
  await page.getByRole('button', { name: /^Tides/ }).click();
  await expect(page.locator('.reading')).toContainText('High water at six — and again');
});
