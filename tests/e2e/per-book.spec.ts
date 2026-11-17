import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

async function bars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 450);
  await expect(page.locator('#openType')).toBeVisible();
}
async function open(page: Page, title: RegExp) {
  await page.getByRole('button', { name: title }).first().click();
  await expect(page.locator('.reader .reading').first()).toBeVisible();
  await page.waitForTimeout(400);
}
async function leave(page: Page) {
  await bars(page);
  await page.click('#closeReader');
  await expect(page.locator('.reader')).toHaveCount(0);
}
const size = (page: Page) => page.locator('.reading').first().evaluate((el) => getComputedStyle(el).fontSize);

test('each book keeps the type changed while it was open, and goes back to the defaults from the header', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles([fixture('lantern.epub'), fixture('tide.txt')]);
  await expect(page.locator('.doc-card')).toHaveCount(2);
  await page.keyboard.press('Escape');

  await open(page, /^The Lantern Keeper/);
  const before = await size(page);
  await bars(page);
  await page.click('#openType');
  await page.click('#panel-text');
  // No way back until the book has something of its own, and then a small icon in the header.
  await expect(page.locator('#useDefaults')).toHaveCount(0);
  for (let i = 0; i < 4; i++) await page.click('#larger');
  await expect(page.locator('.sheet-head #useDefaults')).toBeVisible();
  await expect(page.locator('#useForAll')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const bigger = await size(page);
  expect(parseFloat(bigger)).toBeGreaterThan(parseFloat(before));
  await leave(page);

  // Another book reads with the defaults.
  await open(page, /^Tide/i);
  expect(await size(page)).toBe(before);
  await leave(page);

  // The first remembers its own, until it goes back to the defaults.
  await open(page, /^The Lantern Keeper/);
  expect(await size(page)).toBe(bigger);
  await bars(page);
  await page.click('#openType');
  await page.click('#useDefaults');
  await expect(page.locator('#useDefaults')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect.poll(() => size(page)).toBe(before);
  await leave(page);

  // The defaults themselves are in Settings → Reading, for every book without its own.
  await page.click('#openSettings');
  await page.click('#settings-reading');
  await page.click('#larger');
  await page.click('#larger');
  await page.keyboard.press('Escape');
  await open(page, /^Tide/i);
  expect(parseFloat(await size(page))).toBeGreaterThan(parseFloat(before));
});
