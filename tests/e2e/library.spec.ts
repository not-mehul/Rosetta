// The library as a grid of covers, with every book given one, and the
// controls kept to one row so the books start high on the screen.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(['garden.md', 'tide.txt', 'harbour.pdf', 'field-notes.docx'].map(fixture));
  await expect(page.locator('.doc-card')).toHaveCount(4);
});

test('a grid of covers by default, a drawn one for every book without its own', async ({ page }) => {
  await expect(page.locator('.doc-grid')).toBeVisible();
  const garden = page.locator('.doc-tile', { hasText: 'Garden Diary' });
  await expect(garden.locator('.cover-art .cover-title')).toHaveText('Garden Diary');
  await expect(garden.locator('.cover-author')).toHaveText('Tom Reed');
  // The PDF has its first page for a cover.
  await expect(page.locator('.doc-tile', { hasText: 'Harbour Charts' }).locator('img')).toHaveCount(1);
  // A book keeps its tint through a reload.
  const tint = await garden.locator('.cover-art').getAttribute('class');
  await page.reload();
  await expect(page.locator('.doc-tile', { hasText: 'Garden Diary' }).locator('.cover-art')).toHaveAttribute('class', tint!);
});

test('the books start high: one row of controls under the header, a search field and the filter', async ({ page }) => {
  const top = (await page.locator('.doc-grid > li').first().boundingBox())!.y;
  expect(top).toBeLessThan(915 * 0.55);
  // No shelves as tabs: the search field and the filter share one row.
  await expect(page.locator('#shelf-reading, #shelf-all, #shelf-finished, #searchLibrary')).toHaveCount(0);
  const field = (await page.locator('#libraryFilter').boundingBox())!;
  const filter = (await page.locator('#arrangeLibrary').boundingBox())!;
  expect(Math.abs(field.y + field.height / 2 - (filter.y + filter.height / 2))).toBeLessThan(4);
  // Every cover carries a mark for how far along it is; none is opened yet.
  await expect(page.locator('.doc-tile .status-mark[data-status=unread]')).toHaveCount(4);
  // No unread chip, no format or file size on the shelf.
  await expect(page.locator('.doc-grid')).not.toContainText('KB');
});

test('Arrange switches to a list, and it stays a list', async ({ page }) => {
  await page.click('#arrangeLibrary');
  await page.click('#layout-list');
  await page.keyboard.press('Escape');
  await expect(page.locator('.doc-list')).toBeVisible();
  await expect(page.locator('.doc-list .cover-initial').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.doc-list')).toBeVisible();
  await expect(page.locator('#arrangeLibrary')).not.toHaveClass(/is-set/);
});

test('the search field filters as you type, and clearing it shows everything', async ({ page }) => {
  await page.fill('#libraryFilter', 'tide');
  await expect(page.locator('.doc-card')).toHaveCount(1);
  await page.fill('#libraryFilter', '');
  await expect(page.locator('.doc-card')).toHaveCount(4);
});

test('the filter: three states in one row, toggled; collections at the bottom', async ({ page }) => {
  await page.click('#arrangeLibrary');
  const chips = page.locator('.show-row [role=radio]');
  await expect(chips).toHaveText(['Not started', 'Reading', 'Finished']);
  const boxes = await chips.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ y: r.top, w: r.width, right: r.right })));
  expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
  expect(Math.max(...boxes.map((b) => b.w)) - Math.min(...boxes.map((b) => b.w))).toBeLessThan(1);
  expect(boxes[2]!.right).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.click('#show-unread');
  await expect(page.locator('#show-unread')).toHaveAttribute('aria-checked', 'true');
  await page.click('#show-unread');
  await expect(page.locator('#show-unread')).toHaveAttribute('aria-checked', 'false');
  // Collections are the sheet's last field.
  const fields = page.locator('dialog[open] .field > .t-field-label');
  await expect(fields.last()).toHaveText('Collections');
});
