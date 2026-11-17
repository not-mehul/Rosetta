// The finishing pass: footnote numbers kept out of the words, large text that
// still fits, a Stats page that invites before it counts, storage drawn as bars,
// a cover in Edit details, and moments that move without being cut off.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

async function add(page: Page, files: string[], button = '#addFirst') {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(button)]);
  await chooser.setFiles(files.map(fixture));
}

async function bars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 420);
  await expect(page.locator('.reader.chrome-hidden')).toHaveCount(0);
}

/** The names of the animations running on what matches. */
const running = (page: Page, selector: string) =>
  page.evaluate((s) => [...document.querySelectorAll(s)].flatMap((el) => el.getAnimations().map((a) => (a as CSSAnimation).animationName)), selector);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('a footnote’s number stays out of Flow and the quote; the hold shows itself', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await bars(page);

  // Flow: the sentence is the words alone; holding it marks it.
  await page.click('#openType');
  await page.click('#panel-page');
  await page.click('#modeFlow');
  await page.keyboard.press('Escape');
  await page.mouse.click(300, 500);
  await page.mouse.click(300, 500);
  const sentence = page.locator('.flow-sentence .visually-hidden');
  await expect(sentence).toHaveText('The keeper kept a log of every ship.');
  const box = (await page.locator('.flow-sentence').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // The hold shows itself before it lands.
  await expect(page.locator('.flow-hold.is-holding')).toHaveCount(1);
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(page.locator('.mark-quote')).toHaveText(/^The keeper kept a log of every ship\.?$/);
  await page.click('#saveNote');
  await expect(page.locator('.flow-hold.is-holding')).toHaveCount(0);
});

test('a footnote’s number stays out of search', async ({ page }) => {
  await add(page, ['lantern.epub']);
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await bars(page);
  await page.click('#openSearch');
  await page.fill('#searchInput', 'every ship');
  const hit = page.locator('#searchResults .search-excerpt').first();
  await expect(hit).toContainText('kept a log of every ship');
  await expect(hit).not.toContainText('log1');
});

test('with text at 200%, tabs, choices and filters still fit', async ({ page }) => {
  await add(page, ['lantern.epub', 'garden.md']);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

  // The filter chips wrap their words rather than clip them.
  await page.click('#arrangeLibrary');
  const clipped = await page.locator('.show-row [role=radio]').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
  expect(clipped).toBe(0);
  await page.keyboard.press('Escape');

  // Settings tabs keep their icons and drop the word once it no longer fits.
  await page.click('#openSettings');
  await expect(page.locator('.sheet-icon-tabs.is-tight')).toHaveCount(1);
  // Choices that wrap sit in an even grid, not three and one.
  await page.click('#settings-reading');
  const wrapped = page.locator('.segmented.is-wrapped');
  if (await wrapped.count()) {
    const rows = await wrapped.first().evaluate((el) => new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top))).size);
    expect(rows).toBeLessThanOrEqual(2);
  }
});

test('Stats invites before it counts; storage is drawn as bars', async ({ page }) => {
  await page.click('#tab-stats');
  await expect(page.locator('#view-stats .empty-title')).toBeVisible();
  await expect(page.locator('.stat-tile')).toHaveCount(0);

  await page.click('#tab-library');
  await add(page, ['lantern.epub', 'tide.txt']);
  await expect(page.locator('.doc-card')).toHaveCount(2);
  await page.click('#openSettings');
  await page.click('#settings-general');
  await page.click('#openStorage');
  const fills = page.locator('.storage-figure .bar-fill');
  await expect(fills).toHaveCount(2);
  // The largest book fills its bar; the rest are a share of it.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const widths = await fills.evaluateAll((els) => els.map((el) => getComputedStyle(el).transform));
  expect(widths.some((w) => w === 'none' || w.startsWith('matrix(1,'))).toBe(true);
});

test('Edit details shows the cover it will keep', async ({ page }) => {
  await add(page, ['lantern.epub', 'tide.txt']);
  await page.getByRole('button', { name: 'Details for The Lantern Keeper' }).click();
  await page.click('#editDetails');
  const cover = page.locator('.edit-cover .cover-art');
  await expect(cover).toBeVisible();
  // It follows the title as it is typed.
  await page.fill('#editTitle', 'The Lamp');
  await expect(cover).toContainText('The Lamp');
});

test('icons may move past their box; a new book pops on; sections slide', async ({ page }) => {
  // Motion inside an icon is not cut off at the icon's edge.
  expect(await page.locator('svg[data-icon]').first().evaluate((el) => getComputedStyle(el).overflow)).toBe('visible');

  await add(page, ['lantern.epub', 'tide.txt']);
  await expect(page.locator('.doc-card.is-new')).toHaveCount(2);

  // Sections slide along the tabs' axis; the add button is not carried with them.
  await page.click('#tab-notes');
  await expect.poll(() => running(page, '.axis-stage > [role=tabpanel]')).toContain('axis-in');
  await page.click('#tab-library');
  await expect.poll(() => running(page, '.axis-stage > [role=tabpanel]')).toContain('axis-in');
  expect(await running(page, '.fab')).not.toContain('axis-in');
});
