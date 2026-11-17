// The reader's Aa panel: see-through, as tall as the reader's other sheets,
// with only the controls that apply to the open document; Settings holds the
// defaults and the rest.
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

  // The panel opens as tall as Contents does, whichever tab it is on.
  await page.click('#openContents');
  const contents = (await page.locator('dialog.sheet[open]').boundingBox())!;
  await page.keyboard.press('Escape');
  await page.click('#openType');
  await expect(tabs(page)).toHaveText(['Text', 'Page', 'Light', 'Listen']);
  const panel = (await page.locator('dialog.sheet-peek').boundingBox())!;
  expect(Math.abs(panel.height - contents.height)).toBeLessThanOrEqual(2);
  await page.click('#panel-light');
  expect(Math.abs((await page.locator('dialog.sheet-peek').boundingBox())!.height - panel.height)).toBeLessThanOrEqual(2);
  await page.click('#panel-text');
  // Nothing dims the page behind it.
  const backdrop = await page.locator('dialog.sheet-peek').evaluate((d) => getComputedStyle(d, '::backdrop').backgroundColor);
  expect(backdrop).toBe('rgba(0, 0, 0, 0)');
  // A change shows on the text above.
  const before = await page.locator('.reading p').first().evaluate((p) => getComputedStyle(p).fontSize);
  await page.click('#larger');
  await expect.poll(() => page.locator('.reading p').first().evaluate((p) => getComputedStyle(p).fontSize)).not.toBe(before);
  await expect(page.locator('.reading p').first()).toBeInViewport();
});

test('each tab holds only its own: text, page, light and listening', async ({ page }) => {
  await open(page, 'lantern.epub');
  await page.click('#openType');
  const body = page.locator('#panelBody');
  // Text: typeface (Serif or Sans), size, line spacing, justified lines, the book's original style.
  await expect(body.locator('[aria-labelledby=faceLabel] [role=radio]')).toHaveText(['Serif', 'Sans']);
  for (const here of ['#larger', '[data-spacing=loose]']) await expect(body.locator(here)).toBeVisible();
  await expect(body.getByRole('switch', { name: /Justify lines/ })).toBeVisible();
  for (const gone of [/Visual anchors/, /Reading ruler/]) await expect(body.getByRole('switch', { name: gone })).toHaveCount(0);
  await expect(body.locator('[data-measure]')).toHaveCount(0);
  // Page: scroll, pages or Flow, and the screen kept on; the rest is in Settings.
  await page.click('#panel-page');
  for (const here of ['#modeScroll', '#modePaged', '#modeFlow', '#startAutoScroll']) await expect(body.locator(here)).toBeVisible();
  await expect(body.getByRole('switch', { name: /Keep the screen on/ })).toBeVisible();
  for (const gone of ['#turn-curl', '#flowSpeed', '#scrollSpeed']) await expect(body.locator(gone)).toHaveCount(0);
  await expect(body.getByRole('switch', { name: /Volume keys/ })).toHaveCount(0);
  // Light: true black and five steps of night light; no theme, no sliders.
  await page.click('#panel-light');
  await expect(body.getByRole('switch', { name: /True black/ })).toBeVisible();
  await expect(body.locator('[data-light] .light-name')).toHaveText(['Off', 'Soft', 'Warm', 'Evening', 'Night']);
  await expect(body.locator('[data-theme-option], #dim, #warmth')).toHaveCount(0);
  await body.locator('[data-light=evening]').click();
  await expect(page.locator('.night-veil[data-light=evening]')).toBeAttached();
  await body.locator('[data-light=off]').click();
  await expect(page.locator('.night-veil')).toHaveCount(0);
  // Listen: read aloud, its speed and voice.
  await page.click('#panel-listen');
  for (const here of ['#readAloud', '#speechRate']) await expect(body.locator(here)).toBeVisible();
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

test('Settings has tabs: general, the reading defaults, listening, data and about', async ({ page }) => {
  await page.click('#openSettings');
  const sheet = page.locator('dialog[open]');
  await expect(sheet.getByRole('tablist').getByRole('tab')).toHaveText(['General', 'Reading', 'Listen', 'Data', 'About']);
  // General: theme, language (Russian too), goals and the reminder.
  await expect(sheet.locator('[data-theme-option=dark]')).toBeVisible();
  await sheet.locator('#language').click();
  await expect(page.locator('[data-value=ru]')).toHaveText(/Русский/);
  await page.keyboard.press('Escape');
  await expect(sheet.locator('[data-goal="30"]')).toBeVisible();
  await expect(sheet.locator('[data-year-goal="12"]')).toBeVisible();
  await expect(sheet).toContainText('Reminders come in the Android and iOS apps.');
  // Reading: the defaults, with the niche ones under Advanced, off to begin with.
  await page.click('#settings-reading');
  for (const here of ['#faceSerif', '#larger', '#modePaged', '#turn-curl', '#flowSpeed', '#scrollSpeed', '[data-light=night]', '[data-measure=wide]']) await expect(sheet.locator(here)).toBeVisible();
  for (const name of [/Reading ruler/, /Visual anchors/]) await expect(sheet.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false');
  // Listen.
  await page.click('#settings-listen');
  await expect(sheet.locator('#speechRate')).toBeVisible();
  // The tab is remembered.
  await page.keyboard.press('Escape');
  await page.click('#openSettings');
  await expect(page.locator('#settings-listen')).toHaveAttribute('aria-selected', 'true');
});

test('the reading text follows the phone’s text size', async ({ page }) => {
  await open(page, 'garden.md');
  const size = () => page.locator('.reading p').first().evaluate((p) => parseFloat(getComputedStyle(p).fontSize));
  const normal = await size();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect.poll(size).toBeGreaterThan(normal * 1.8);
});
