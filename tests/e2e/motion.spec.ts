// Icons answer a tap with a small motion of their own (src/styles/motion.css),
// once; a book's cover mark plays when its state changes; and reduced motion
// leaves all of it out.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

/** The animations running on an icon and its parts. */
const motions = (page: Page, icon: string, within = '') =>
  page.evaluate(
    ([icon, within]) => {
      const svg = document.querySelector(`${within} svg[data-icon="${icon}"][data-play]`);
      return svg ? [...new Set(svg.getAnimations({ subtree: true }).map((a) => (a as CSSAnimation).animationName))].sort() : [];
    },
    [icon, within] as const,
  );

test('a tapped icon plays its own motion, once', async ({ page }) => {
  await page.goto('/');
  // Nothing plays before a tap.
  await expect(page.locator('svg[data-play]')).toHaveCount(0);
  await page.click('#openSettings');
  await expect.poll(() => motions(page, 'settings')).toEqual(['icon-gear']);
  // A tab's icon plays as it is chosen; each icon its own.
  await page.click('#settings-data');
  await expect.poll(() => motions(page, 'database')).toEqual(['icon-settle', 'icon-settle-small']);
  await page.click('#settings-about');
  await expect.poll(() => motions(page, 'info')).toEqual(['icon-dot-drop', 'icon-grow']);
  // And comes to rest: the attribute goes once the motion is over.
  await expect(page.locator('svg[data-icon="settings"][data-play]')).toHaveCount(0, { timeout: 3000 });
  await page.keyboard.press('Escape');
  await page.click('#tab-stats');
  await expect.poll(() => motions(page, 'chart-column')).toEqual(['icon-rise']);
});

test('a cover mark plays when its book changes state, not when the library opens', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles([fixture('tide.txt'), fixture('garden.md')]);
  await expect(page.locator('.doc-card')).toHaveCount(2);
  await expect(page.locator('.status-mark svg[data-play]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Details for Tide' }).click();
  await page.click('#toggleFinished');
  await page.keyboard.press('Escape');
  const mark = page.locator('.doc-card', { hasText: 'Tide' }).locator('.status-mark');
  await expect(mark).toHaveAttribute('data-status', 'finished');
  await expect.poll(() => motions(page, 'check', '.doc-card .status-mark')).toContain('icon-draw');
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('nothing moves', async ({ page }) => {
    await page.goto('/');
    await page.click('#openSettings');
    await page.click('#settings-data');
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => [...document.querySelectorAll('svg[data-icon]')].flatMap((svg) => svg.getAnimations({ subtree: true })).length)).toBe(0);
  });
});
