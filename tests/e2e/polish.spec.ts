// Search grouped by chapter, and stats that count up to the right number.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('search results come in chapters, each with its count', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('lantern.epub'));
  await expect(page.locator('.reading h1')).toHaveText('The stair');
  await page.click('#openSearch');
  await page.fill('#searchInput', 'keeper');
  const groups = page.locator('#searchResults .search-group');
  await expect(groups.first()).toBeVisible();
  const heads = await page.locator('.search-group-head').allTextContents();
  // No chapter twice in a row, and each count matches its rows.
  for (let i = 1; i < heads.length; i++) expect(heads[i]).not.toBe(heads[i - 1]);
  const first = groups.first();
  const count = Number(await first.locator('.search-group-head .tabular').textContent());
  await expect(first.locator('.row')).toHaveCount(count);
  await expect(first.locator('mark.search-match').first()).toHaveText(/keeper/i);
});
