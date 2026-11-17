// The three top-level sections as icon tabs under the header (style.md §8.5.1).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test('Library, Notes and Stats are tabs under the name; Back goes home to the library', async ({ page }) => {
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Sections' }).getByRole('tab');
  await expect(tabs).toHaveText(['Library', 'Notes', 'Stats']);
  await expect(page.locator('#tab-library')).toHaveAttribute('aria-selected', 'true');

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('garden.md'));
  await page.click('#closeReader');

  await expect(page.locator('.t-page-title')).toHaveText('Rosetta');
  await expect(page.locator('#sectionTagline')).toContainText('Books, papers and notes');
  for (const [tab, tagline, view] of [
    ['notes', 'bookmark', '#view-notes'],
    ['stats', 'Minutes, days and streaks', '#view-stats'],
  ] as const) {
    await page.click(`#tab-${tab}`);
    await expect(page.locator('#tab-' + tab)).toHaveAttribute('aria-selected', 'true');
    // The name stays; the line under it says what the section holds.
    await expect(page.locator('.t-page-title')).toHaveText('Rosetta');
    await expect(page.locator('#sectionTagline')).toContainText(tagline);
    await expect(page.locator(view)).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
  }

  // Escape (Back on Android) from a section goes home, not out of the app.
  await page.keyboard.press('Escape');
  await expect(page.locator('#tab-library')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.doc-card')).toHaveCount(1);

  // Settings sits at the right of the name's row, with no row of its own and no theme toggle.
  const settings = await page.locator('#openSettings').boundingBox();
  const title = await page.locator('.t-page-title').boundingBox();
  expect(settings!.x + settings!.width).toBeGreaterThan(380);
  expect(settings!.y).toBeLessThan(title!.y + title!.height);
  await expect(page.locator('.theme-toggle, [role=switch][aria-label*=Dawn]')).toHaveCount(0);
});
