// The four top-level sections as icon tabs under the header (style.md §8.5.1).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('Library, Notes, Stats and Catalogs are tabs; Back goes home to the library', async ({ page }) => {
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Sections' }).getByRole('tab');
  await expect(tabs).toHaveText(['Library', 'Notes', 'Stats', 'Catalogs']);
  await expect(page.locator('#tab-library')).toHaveAttribute('aria-selected', 'true');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('garden.md'));
  await page.click('#closeReader');

  for (const [tab, title, view] of [
    ['notes', 'Lines worth keeping', '#view-notes'],
    ['stats', 'Time on the page', '#view-stats'],
    ['catalogs', 'Open shelves', '#view-catalogs'],
  ] as const) {
    await page.click(`#tab-${tab}`);
    await expect(page.locator('#tab-' + tab)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.t-page-title')).toHaveText(title);
    await expect(page.locator(view)).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  }

  // Escape (Back on Android) from a section goes home, not out of the app.
  await page.keyboard.press('Escape');
  await expect(page.locator('#tab-library')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.doc-card')).toHaveCount(1);

  // Settings and the theme toggle sit at the header's right.
  const tools = await page.locator('.header-tools').boundingBox();
  expect(tools!.x + tools!.width).toBeGreaterThan(380);
});
