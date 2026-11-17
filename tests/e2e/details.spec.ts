// Book details: one button to read it, the rest as rows, Remove last.
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('details lead with the cover and one button, then rows, with Remove alone at the end', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles([fixture('lantern.epub'), fixture('garden.md')]);
  await expect(page.locator('.doc-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Details for Garden Diary' }).click();

  const sheet = page.locator('dialog[open]');
  await expect(sheet.locator('.details-cover .cover-art')).toBeVisible();
  await expect(sheet.locator('.details-title')).toHaveText('Garden Diary');
  await expect(sheet.locator('.btn-primary')).toHaveCount(1);
  await expect(sheet.locator('#readDoc')).toHaveText('Read');
  // Named for where it goes (style.md §14.1).
  await expect(sheet.locator('#sendBookShelf')).toHaveText('Send to BookShelf');
  // Remove comes after every other row.
  const rows = await sheet.locator('.row').evaluateAll((els) => els.map((e) => e.id || e.textContent?.trim()));
  expect(rows.at(-1)).toBe('removeDoc');
  await expect(sheet.locator('#removeDoc')).toHaveClass(/row-danger/);
});
