// Searching the library finds words inside the books, opened or not, and goes to them.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

test('the library search looks inside every book and opens the place', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles([fixture('lantern.epub'), fixture('tide.txt'), fixture('harbour.pdf')]);
  await expect(page.locator('.doc-card')).toHaveCount(3);

  await page.click('#searchLibrary');
  await page.fill('#libraryFilter', 'green cloth');
  // No title has the words, but a book does.
  await expect(page.locator('#textResults .text-book')).toHaveCount(1, { timeout: 20000 });
  const book = page.locator('#textResults .text-book').first();
  await expect(book).toContainText('The Lantern Keeper');
  await expect(book.locator('.text-match').first()).toHaveText('green cloth');
  await expect(book.locator('.text-hit')).toHaveCount(3);

  // A PDF's pages are searched too, and both books with the albatross show.
  await page.fill('#libraryFilter', 'albatross');
  await expect(page.locator('#textResults .text-book')).toHaveCount(2, { timeout: 20000 });
  await expect(page.locator('#textResults .text-book', { hasText: 'Harbour' })).toContainText('Page 2 of 3');

  // Words no book has.
  await page.fill('#libraryFilter', 'zebra crossing');
  await expect(page.locator('#textResultsNone')).toBeVisible({ timeout: 20000 });

  // Back to a hit: it opens the book there.
  await page.fill('#libraryFilter', 'quiet morning');
  await expect(page.locator('#textResults .text-book', { hasText: /tide/i })).toBeVisible({ timeout: 20000 });
  await page.locator('#textResults .text-hit').first().click();
  await expect(page.locator('.reader')).toBeVisible();
  await expect(page.locator('.reading')).toContainText('quiet morning');
});
