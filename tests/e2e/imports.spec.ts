// Kindle highlights brought over, and a Calibre library folder added with its details.
import { expect, test } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

const CLIPPINGS = `The Lantern Keeper (Ada Marlow)
- Your Highlight on page 3 | Location 40-41 | Added on Monday, 3 March 2025 10:00:00

climbed the stair each evening and counted the ships
==========
The Lantern Keeper (Ada Marlow)
- Your Note on page 3 | Location 41 | Added on Monday, 3 March 2025 10:01:00

Every night.
==========
The Lantern Keeper (Ada Marlow)
- Your Highlight on page 9 | Location 99-100 | Added on Monday, 3 March 2025 10:05:00

Words from another edition entirely.
==========
Moby-Dick (Herman Melville)
- Your Highlight on page 1 | Location 5-6 | Added on Monday, 3 March 2025 11:00:00

Call me Ishmael.
==========
`;

test('Kindle highlights land on the same words, and the rest are kept in the book note', async ({ page }) => {
  await page.goto('/');
  const [first] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await first.setFiles(fixture('lantern.epub'));
  await expect(page.locator('.reader')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.click('#openSettings');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#importKindle')]);
  await chooser.setFiles({ name: 'My Clippings.txt', mimeType: 'text/plain', buffer: Buffer.from(CLIPPINGS) });
  await expect(page.locator('#toast')).toContainText('1 highlights placed, 1 kept in book notes.');
  await expect(page.locator('#toast')).toContainText('Moby-Dick');
  await page.keyboard.press('Escape');

  await page.click('#tab-notes');
  await expect(page.locator('#allNotes .highlight-row')).toHaveCount(1);
  await expect(page.locator('#allNotes')).toContainText('climbed the stair each evening and counted the ships');
  await expect(page.locator('#allNotes')).toContainText('Every night.');
  await page.click('#tab-library');
  await page.locator('.doc-more').first().click();
  await expect(page.locator('#bookNote')).toHaveValue(/Words from another edition entirely/);
  await page.keyboard.press('Escape');

  // Importing the same file again adds nothing twice.
  await page.click('#openSettings');
  const [again] = await Promise.all([page.waitForEvent('filechooser'), page.click('#importKindle')]);
  await again.setFiles({ name: 'My Clippings.txt', mimeType: 'text/plain', buffer: Buffer.from(CLIPPINGS) });
  await expect(page.locator('#toast')).toContainText('0 highlights placed, 0 kept');
});

test.describe('in a browser that picks folders', () => {
  test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36' });

  test('a Calibre folder brings its titles, series, tags and covers', async ({ page }) => {
    const root = mkdtempSync(join(tmpdir(), 'calibre-'));
    const book = join(root, 'Calibre Library', 'Ada Marlow', 'The Night Watch (7)');
    mkdirSync(book, { recursive: true });
    copyFileSync(fixture('lantern.epub'), join(book, 'The Night Watch - Ada Marlow.epub'));
    writeFileSync(
      join(book, 'metadata.opf'),
      `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>The Night Watch</dc:title><dc:creator>Ada Marlow</dc:creator><dc:subject>Lighthouses</dc:subject><meta name="calibre:series" content="Harbour Tales"/><meta name="calibre:series_index" content="2"/></metadata></package>`,
    );
    writeFileSync(join(book, 'cover.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAA8CAIAAACb22+3AAAAUElEQVR4Xu3QQQ3AMBDAsK64CmwQB2sqidzHJhApz/eeNWFPRC/hjNUZqzNWZ6zOWJ2xOmN1xuqM1RmrM1ZnrM5YnbE6Y3XG6ozVGaszY6t/2uAB9JX4PJ8AAAAASUVORK5CYII=', 'base64'));
    copyFileSync(fixture('tide.txt'), join(root, 'Calibre Library', 'tide.txt'));

    await page.goto('/');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFolderFirst')]);
    await chooser.setFiles(join(root, 'Calibre Library'));
    await expect(page.locator('.doc-card')).toHaveCount(2);
    const tile = page.locator('.doc-card', { hasText: 'The Night Watch' });
    await expect(tile).toBeVisible();
    await expect(tile.locator('img')).toHaveCount(1);
    await tile.locator('.doc-more').click();
    await expect(page.locator('dialog[open]')).toContainText('Harbour Tales');
    await expect(page.locator('dialog[open]')).toContainText('#lighthouses');
  });
});
