// A fixed-layout EPUB's page sits in the middle of the screen, scaled to fit,
// and turns with a tap at the edge.
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

function fixedEpub(pages: number): Buffer {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/p.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  };
  const items: string[] = [];
  const spine: string[] = [];
  for (let i = 1; i <= pages; i++) {
    files[`OEBPS/p${i}.xhtml`] = strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="viewport" content="width=600, height=800"/></head><body><div style="width:600px;height:800px;background:#c9b48a">Page ${i}</div></body></html>`);
    items.push(`<item id="p${i}" href="p${i}.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="p${i}"/>`);
  }
  files['OEBPS/p.opf'] = strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Picture Book</dc:title><meta property="rendition:layout">pre-paginated</meta></metadata><manifest>${items.join('')}</manifest><spine>${spine.join('')}</spine></package>`);
  return Buffer.from(zipSync(files));
}

test('a fixed-layout page is centred and scaled to the screen', async ({ page }) => {
  await page.goto('/');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles({ name: 'picture-book.epub', mimeType: 'application/epub+zip', buffer: fixedEpub(3) });
  const sheet = page.locator('.fixed-page');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(500);
  const pager = (await page.locator('.fixed-pager').boundingBox())!;
  const box = (await sheet.boundingBox())!;
  // Inside the screen, and in its middle.
  expect(box.width).toBeLessThanOrEqual(pager.width + 1);
  expect(box.height).toBeLessThanOrEqual(pager.height + 1);
  expect(Math.abs(box.x + box.width / 2 - (pager.x + pager.width / 2))).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - (pager.y + pager.height / 2))).toBeLessThan(2);
  expect(await sheet.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
  // A tap at the right edge turns the page.
  await page.mouse.click(pager.x + pager.width - 10, pager.y + pager.height / 2);
  await expect(page.locator('.page-number')).toHaveText('Page 2 of 3');
});
