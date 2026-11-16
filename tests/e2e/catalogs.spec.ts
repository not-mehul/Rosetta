// A catalog on a home server that wants a sign-in, browsed and downloaded from.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EPUB = readFileSync(fileURLToPath(new URL('../fixtures/lantern.epub', import.meta.url)));
const ROOT = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Home library</title>
<entry><id>shelf</id><title>Lighthouse stories</title><link rel="subsection" href="/opds/shelf" type="application/atom+xml;profile=opds-catalog"/></entry></feed>`;
const SHELF = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Lighthouse stories</title>
<entry><id>1</id><title>The Lantern Keeper</title><author><name>Ada Marlow</name></author>
<link rel="http://opds-spec.org/acquisition" href="/get/1.epub" type="application/epub+zip"/></entry></feed>`;

test('a home catalog asks for its sign-in once, and Back goes up a feed', async ({ page }) => {
  const signIn = `Basic ${Buffer.from('ada:lämp').toString('base64')}`;
  await page.route('http://192.168.1.20:8080/**', (route) => {
    const req = route.request();
    if (req.headers().authorization !== signIn) return route.fulfill({ status: 401 });
    const path = new URL(req.url()).pathname;
    if (path === '/opds') return route.fulfill({ body: ROOT, contentType: 'application/atom+xml' });
    if (path === '/opds/shelf') return route.fulfill({ body: SHELF, contentType: 'application/atom+xml' });
    return route.fulfill({ body: EPUB, contentType: 'application/epub+zip' });
  });
  await page.goto('/');
  await page.click('#tab-catalogs');
  await page.click('#addCatalog');
  await page.fill('#promptInput', '192.168.1.20:8080/opds');
  await page.click('#promptAction');
  await page.locator('#catalogList .row', { hasText: '192.168.1.20' }).click();

  // It answers 401: user name, then password.
  await expect(page.locator('#promptInput')).toBeVisible();
  await page.fill('#promptInput', 'ada');
  await page.click('#promptAction');
  await page.fill('#promptInput', 'lämp');
  await page.click('#promptAction');
  await page.getByRole('button', { name: /Lighthouse stories/ }).click();
  await expect(page.getByText('The Lantern Keeper')).toBeVisible();

  // Escape (Android's Back) goes up one feed, then leaves the catalog, then goes home to the library.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Lighthouse stories/ })).toBeVisible();
  await page.getByRole('button', { name: /Lighthouse stories/ }).click();
  await page.getByRole('button', { name: 'EPUB' }).click();
  await expect(page.locator('#toast')).toContainText('Added 1 document');
});
