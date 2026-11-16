// The reader's Aa panel: short and see-through, with only the controls that
// apply to the open document; Settings keeps only what applies everywhere.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

async function open(page: Page, name: string) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture(name));
}
const tabs = (page: Page) => page.getByRole('tablist', { name: 'Reading controls' }).getByRole('tab');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('a book gets Text, Page, Light and Listen; the page shows through and changes as you go', async ({ page }) => {
  await open(page, 'lantern.epub');
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  // The chapter is the bar's title, the book its eyebrow, and read aloud isn't in the bar.
  await expect(page.locator('.reader-book')).toHaveText('The Lantern Keeper');
  await expect(page.locator('.reader-bar #readAloud')).toHaveCount(0);

  await page.click('#openType');
  await expect(tabs(page)).toHaveText(['Text', 'Page', 'Light', 'Listen']);
  const panel = (await page.locator('dialog.sheet-peek').boundingBox())!;
  expect(panel.height).toBeLessThanOrEqual(915 * 0.53);
  // Nothing dims the page behind it.
  const backdrop = await page.locator('dialog.sheet-peek').evaluate((d) => getComputedStyle(d, '::backdrop').backgroundColor);
  expect(backdrop).toBe('rgba(0, 0, 0, 0)');
  // A change shows on the text above.
  const before = await page.locator('.reading p').first().evaluate((p) => getComputedStyle(p).fontSize);
  await page.click('#larger');
  await expect.poll(() => page.locator('.reading p').first().evaluate((p) => getComputedStyle(p).fontSize)).not.toBe(before);
  await expect(page.locator('.reading p').first()).toBeInViewport();
});

test('a PDF gets Page (fit, zoom, Dusk pages), Light and Listen, and no typeface', async ({ page }) => {
  await open(page, 'harbour.pdf');
  await expect(page.locator('.pdf-page')).toHaveCount(3);
  await page.click('#openType');
  await expect(tabs(page)).toHaveText(['Page', 'Light', 'Listen']);
  await expect(page.locator('#fitWidth')).toBeVisible();
  await expect(page.getByRole('switch', { name: /Dusk pages/ })).toBeVisible();
  await expect(page.locator('#modeScroll')).toHaveCount(0);
});

test('a comic gets Page and Light only: no type, no reading aloud', async ({ page }) => {
  await open(page, 'tin-moon.cbz');
  await page.click('#openType');
  await expect(tabs(page)).toHaveText(['Page', 'Light']);
  await expect(page.locator('#modeFlow')).toHaveCount(0);
});

test('Settings keeps what applies everywhere, and says where the rest went', async ({ page }) => {
  await page.click('#openSettings');
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('radio', { name: 'Dusk' })).toBeVisible();
  await expect(sheet.locator('#language')).toBeVisible();
  await expect(sheet).toContainText('under Aa');
  for (const gone of ['#modePaged', '#larger', '#dim', '#fitWidth']) await expect(sheet.locator(gone)).toHaveCount(0);
});

test('the reading text follows the phone’s text size', async ({ page }) => {
  await open(page, 'garden.md');
  const size = () => page.locator('.reading p').first().evaluate((p) => parseFloat(getComputedStyle(p).fontSize));
  const normal = await size();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect.poll(size).toBeGreaterThan(normal * 1.8);
});
