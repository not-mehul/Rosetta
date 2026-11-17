// A Calibre library folder added with its details.
import { expect, test } from '@playwright/test';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = (n: string) => fileURLToPath(new URL(`../fixtures/${n}`, import.meta.url));

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
