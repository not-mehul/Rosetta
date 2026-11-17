// The reading ruler, and auto-scroll in scroll mode.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

async function bars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 450);
  await expect(page.locator('#openType')).toBeVisible();
}

test('the ruler veils all but a line, and moves', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('lantern.epub'));
  await expect(page.locator('.reading h1').first()).toBeVisible();
  await expect(page.locator('.ruler')).toHaveCount(0);
  await bars(page);
  await page.click('#openType');
  await page.click('#panel-text');
  await page.getByRole('switch', { name: /Reading ruler/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ruler-band')).toBeVisible();
  const before = (await page.locator('.ruler-band').boundingBox())!;
  await page.locator('#rulerGrip').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const after = (await page.locator('.ruler-band').boundingBox())!;
  expect(after.y).toBeGreaterThan(before.y + 20);
  // About one line high.
  expect(before.height).toBeGreaterThan(25);
  expect(before.height).toBeLessThan(60);
});

test('auto-scroll moves the page, pauses on a tap, and stops', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('lantern.epub'));
  await expect(page.locator('.reading h1').first()).toBeVisible();
  await bars(page);
  await page.click('#openType');
  await page.click('#panel-page');
  await page.click('#startAutoScroll');
  const y0 = await page.evaluate(() => scrollY);
  await page.waitForTimeout(1500);
  const y1 = await page.evaluate(() => scrollY);
  expect(y1).toBeGreaterThan(y0);
  // A tap pauses it, and the bars come with it.
  await page.mouse.click(200, 450);
  await expect(page.locator('#autoScrollPlay')).toBeVisible();
  const y2 = await page.evaluate(() => scrollY);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => scrollY)).toBe(y2);
  // Faster, then stop.
  await page.click('#autoScrollFaster');
  await expect(page.locator('#autoScrollSpeed')).toHaveText('14 lines/min');
  await page.click('#autoScrollStop');
  await expect(page.locator('.autoscroll-bar')).toHaveCount(0);
});
