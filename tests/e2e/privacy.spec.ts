// A book never reaches the network: every request it could make is caught here.
import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function epub(title: string, body: string, { fixed = false, css = '' } = {}): Buffer {
  const container = '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/p.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
  return Buffer.from(
    zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8(container),
      'OEBPS/p.opf': strToU8(
        `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title>${fixed ? '<meta property="rendition:layout">pre-paginated</meta>' : ''}</metadata><manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/><item id="i" href="pic.png" media-type="image/png"/><item id="s" href="s.css" media-type="text/css"/></manifest><spine><itemref idref="c"/></spine></package>`,
      ),
      'OEBPS/c.xhtml': strToU8(`<html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="viewport" content="width=600, height=800"/><link rel="stylesheet" href="s.css"/></head><body>${body}</body></html>`),
      'OEBPS/pic.png': new Uint8Array(PNG),
      'OEBPS/s.css': strToU8(css),
    }),
  );
}

async function add(page: Page, name: string, buffer: Buffer, button: string) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(button)]);
  await chooser.setFiles({ name, mimeType: 'application/epub+zip', buffer });
}

test('nothing in a book reaches the network', async ({ page }) => {
  const requests: string[] = [];
  await page.route('http://tracker.test/**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await page.goto('/');

  // A picture with a srcset, and a list styled from the web, under the book's own styles.
  await add(
    page,
    'srcset.epub',
    epub('Srcset', '<h1>Pictures</h1><p><img src="pic.png" srcset="http://tracker.test/srcset.png 2x" alt="p"/></p><ul><li>item</li></ul>', {
      css: 'li { list-style-image: image-set("http://tracker.test/imageset.png" 1x); } p { margin: 0 }',
    }),
    '#addFirst',
  );
  await expect(page.locator('.reading h1')).toHaveText('Pictures');
  await expect(page.locator('.reading img')).toHaveAttribute('src', /^blob:/);
  await page.click('#openType');
  await page.getByRole('switch', { name: /Original style/ }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.click('#closeReader');

  // A fixed-layout page whose inline styles try three ways out, and one way that's fine.
  await add(
    page,
    'fixed.epub',
    epub(
      'Fixed',
      '<div style="width:600px;height:200px;background-image:url(\\68ttp://tracker.test/escaped.png)">a</div>' +
        '<div style="width:600px;height:200px;background-image:image-set(&quot;http://tracker.test/fixed.png&quot; 1x)">b</div>' +
        '<div style="width:600px;height:200px;background-image:url(http://tracker.test/plain.png)">c</div>' +
        '<div class="own" style="width:600px;height:200px;background-image:url(pic.png)">d</div>',
      { fixed: true },
    ),
    '#addDocs',
  );
  await page.waitForTimeout(1000);
  expect(requests).toEqual([]);
});
