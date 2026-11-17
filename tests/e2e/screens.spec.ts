import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// A screenshot tour of every main screen, in Dusk and Dawn, for reviewing a
// change by eye or diffing two builds. It asserts nothing about pixels and
// only runs when asked:
//
//   SCREENS=/tmp/screens npx playwright test screens
//
// Two runs into two folders can be compared with any image diff.

const OUT = process.env.SCREENS;
test.skip(!OUT, 'Set SCREENS=<folder> to capture the screenshot tour.');
test.use({ deviceScaleFactor: 1, actionTimeout: 5000 });
test.setTimeout(120_000);

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));
const ALL = ['lantern.epub', 'harbour.pdf', 'garden.md', 'tin-moon.cbz', 'salt-road.fb2', 'field-notes.docx', 'tide.txt', 'orchard.odt', 'ship-log.rtf'];

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}
async function bars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 450);
  await expect(page.locator('#openType')).toBeVisible();
}
async function close(page: Page) {
  for (let i = 0; i < 3 && (await page.locator('dialog[open]').count()); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
}
async function leave(page: Page) {
  await bars(page);
  await page.click('#closeReader');
  await expect(page.locator('.reader')).toHaveCount(0);
}
async function open(page: Page, title: RegExp) {
  await page.getByRole('button', { name: title }).first().click();
  await expect(page.locator('.reader')).toBeVisible();
  await page.waitForTimeout(600);
}

for (const scheme of ['dark', 'light'] as const) {
  test(`screens in ${scheme}`, async ({ page }) => {
    const n = (s: string) => `${scheme}-${s}`;
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await shot(page, n('01-empty'));

    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
    await chooser.setFiles(ALL.map(fixture));
    await expect(page.locator('.doc-card')).toHaveCount(ALL.length);
    await page.waitForTimeout(800);
    await shot(page, n('02-library'), true);

    await page.click('#arrangeLibrary');
    await shot(page, n('03-arrange'));
    await page.click('#layout-list');
    await close(page);
    await shot(page, n('04-library-list'), true);
    await page.click('#arrangeLibrary');
    await page.click('#layout-grid');
    await close(page);

    await page.locator('.doc-more').first().click();
    await shot(page, n('05-details'), true);
    await close(page);

    // A book, with its bars and each tab of the reading panel.
    await open(page, /^The Lantern Keeper/);
    await bars(page);
    await shot(page, n('10-reader'));
    await page.click('#openType');
    for (const tab of ['text', 'page', 'light', 'listen']) {
      const button = page.locator(`#panel-${tab}`);
      if (!(await button.count())) continue;
      await button.click();
      await shot(page, n(`11-panel-${tab}`));
    }
    await close(page);
    await bars(page);
    await page.click('#openContents');
    await shot(page, n('12-contents'));
    await close(page);
    await bars(page);
    await page.click('#openSearch');
    await page.keyboard.type('keeper');
    await page.waitForTimeout(600);
    await shot(page, n('13-search'));
    await close(page);
    for (const mode of ['Paged', 'Flow']) {
      await bars(page);
      await page.click('#openType');
      await page.click('#panel-page');
      await page.click(`#mode${mode}`);
      await close(page);
      await shot(page, n(`16-${mode.toLowerCase()}`));
    }
    // Flow keeps taps for itself; Back leaves the book.
    for (let i = 0; i < 4 && (await page.locator('.reader').count()); i++) await page.keyboard.press('Escape');
    await expect(page.locator('.reader')).toHaveCount(0);

    // A PDF and a comic.
    await open(page, /^Harbour/i);
    await bars(page);
    await shot(page, n('14-pdf'));
    await leave(page);
    await open(page, /^Tin/i);
    await bars(page);
    await shot(page, n('15-comic'));
    await leave(page);

    // The other sections, and settings.
    for (const section of ['notes', 'stats']) {
      const tab = page.locator(`#tab-${section}`);
      if (!(await tab.count())) continue;
      await tab.click();
      await shot(page, n(`20-${section}`), true);
    }
    await page.locator('#tab-library').click();
    await page.click('#openSettings');
    await shot(page, n('30-settings'));
    await close(page);
  });
}
