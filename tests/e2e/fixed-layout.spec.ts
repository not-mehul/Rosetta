// A fixed-layout EPUB's page sits in the middle of the screen, scaled to fit,
// and turns with a tap at the edge.
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { fileURLToPath } from 'node:url';

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

test.describe('on a tablet held sideways', () => {
  test.use({ viewport: { width: 1180, height: 820 } });

  test('a fixed-layout book opens two pages at a time after its cover', async ({ page }) => {
    await page.goto('/');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
    await chooser.setFiles({ name: 'picture-book.epub', mimeType: 'application/epub+zip', buffer: fixedEpub(5) });
    await expect(page.locator('.page-number')).toHaveText('Page 1 of 5');
    await expect(page.locator('.fixed-leaf')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.page-number')).toHaveText('Pages 2–3 of 5');
    await expect(page.locator('.fixed-leaf')).toHaveCount(2);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.page-number')).toHaveText('Pages 4–5 of 5');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.page-number')).toHaveText('Pages 2–3 of 5');
  });

  test('a book in pages mode lies open in two columns', async ({ page }) => {
    await page.goto('/');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
    await chooser.setFiles(fileURLToPath(new URL('../fixtures/lantern.epub', import.meta.url)));
    await expect(page.locator('.reading h1').first()).toBeVisible();
    if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(590, 400);
    await page.click('#openType');
    await page.click('#panel-page');
    await page.click('#modePaged');
    await page.keyboard.press('Escape');
    await expect(page.locator('.reading.paged.spread').first()).toBeVisible();
    // Text on both halves of the screen.
    const halves = await page.evaluate(() => {
      const xs = [...document.querySelectorAll('.reading.paged p')].map((p) => p.getBoundingClientRect()).filter((r) => r.right > 0 && r.left < innerWidth);
      return { left: xs.some((r) => r.right < innerWidth / 2), right: xs.some((r) => r.left > innerWidth / 2) };
    });
    expect(halves).toEqual({ left: true, right: true });
    // Turned off in Settings → Reading → Advanced, one column again.
    if (await page.locator('.reader.chrome-hidden').count()) await page.mouse.click(590, 400);
    await page.click('#closeReader');
    await page.click('#openSettings');
    await page.click('#settings-reading');
    await page.getByRole('switch', { name: /Two pages side by side/ }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^The Lantern Keeper/ }).first().click();
    await expect(page.locator('.reading.paged').first()).toBeVisible();
    await expect(page.locator('.reading.paged.spread')).toHaveCount(0);
  });
});
