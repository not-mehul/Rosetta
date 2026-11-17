// A PDF read as text: its words in the reading column, in any mode, with
// places and highlights that mean the same in both views.
import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

async function bars(page: Page) {
  if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(200, 450);
  await expect(page.locator('#openType')).toBeVisible();
}
async function view(page: Page, which: 'pdfText' | 'pdfPages') {
  await bars(page);
  await page.click('#openType');
  await page.click('#panel-page');
  await page.click(`#${which}`);
  await page.keyboard.press('Escape');
}

test('a PDF switches to text and back, keeping its highlights', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fixture('harbour.pdf'));
  await expect(page.locator('.pdf-page').first()).toBeVisible();

  await view(page, 'pdfText');
  await expect(page.locator('.reading')).toContainText('First page about lighthouses.');
  await expect(page.locator('.pdf-page')).toHaveCount(0);
  await expect(page.locator('.reading :is(h2, h3)').first()).toHaveText('Chart 1');
  // The type settings apply: it's a book now.
  await bars(page);
  await page.click('#openType');
  await expect(page.locator('#panel-text')).toBeVisible();
  await page.keyboard.press('Escape');

  // Highlight a word on the first page, in text.
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector('.reading')!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.nodeValue!.indexOf('lighthouses');
      if (at < 0) continue;
      const r = document.createRange();
      r.setStart(n, at);
      r.setEnd(n, at + 'lighthouses'.length);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
      return;
    }
  });
  await page.click('.selection-bar [data-colour=amber]');
  await expect(page.locator('mark.hl-amber')).toHaveText('lighthouses');

  // Search finds it in the text view too, across the whole PDF.
  await bars(page);
  await page.click('#openSearch');
  await page.fill('#searchInput', 'albatross');
  await expect(page.locator('#searchResults button')).toHaveCount(1);
  await page.locator('dialog[open]').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);

  // Back to pages: the same highlight sits on the page's text layer.
  await view(page, 'pdfPages');
  await expect(page.locator('.pdf-page').first()).toBeVisible();
  await expect(page.locator('.pdf-page mark, .pdf-page .hl-amber').first()).toBeVisible();
  // And the book remembers how it was read.
  await view(page, 'pdfText');
  await bars(page);
  await page.click('#closeReader');
  await page.getByRole('button', { name: /^Harbour/i }).first().click();
  await expect(page.locator('.reading')).toContainText('First page about lighthouses.');
});
