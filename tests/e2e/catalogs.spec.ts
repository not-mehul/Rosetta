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

test('an OPDS 2 catalog shows covers, narrows by its facets, and knows what you have', async ({ page }) => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const covers: string[] = [];
  const book = (id: string, title: string, author: string) => ({
    metadata: { title, identifier: id, author },
    links: [{ rel: 'http://opds-spec.org/acquisition/open-access', href: `/get/${id}.epub`, type: 'application/epub+zip' }],
    images: [{ href: `/cover/${id}.png`, type: 'image/png' }],
  });
  const feed = (lang: string) => ({
    metadata: { title: lang === 'fr' ? 'Livres' : 'Books' },
    links: [{ rel: 'self', href: '/opds2' }],
    facets: [{ metadata: { title: 'Language' }, links: [{ href: '/opds2?lang=en', title: 'English', ...(lang === 'en' ? { rel: 'self' } : {}) }, { href: '/opds2?lang=fr', title: 'French', ...(lang === 'fr' ? { rel: 'self' } : {}) }] }],
    publications: lang === 'fr' ? [book('3', 'Le Phare', 'Anne')] : [book('1', 'The Lantern Keeper', 'Ada Marlow'), book('2', 'Harbour Charts', 'Tomas Reyes')],
  });
  await page.route('https://opds2.test/**', (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith('/cover/')) {
      covers.push(u.pathname);
      return route.fulfill({ body: PNG, contentType: 'image/png' });
    }
    if (u.pathname.startsWith('/get/')) return route.fulfill({ body: EPUB, contentType: 'application/epub+zip' });
    return route.fulfill({ body: JSON.stringify(feed(u.searchParams.get('lang') ?? 'en')), contentType: 'application/opds+json' });
  });
  await page.goto('/');
  // One of the books is already here.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addFirst')]);
  await chooser.setFiles(fileURLToPath(new URL('../fixtures/lantern.epub', import.meta.url)));
  await expect(page.locator('.reader')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.click('#tab-catalogs');
  await page.click('#addCatalog');
  await page.fill('#promptInput', 'https://opds2.test/opds2');
  await page.click('#promptAction');
  await page.locator('#catalogList .row', { hasText: 'opds2.test' }).click();

  const lantern = page.locator('.catalog-book', { hasText: 'The Lantern Keeper' });
  await expect(lantern).toContainText('In your library');
  await expect(lantern.getByRole('button', { name: 'EPUB' })).toHaveCount(0);
  await expect(page.locator('.catalog-book', { hasText: 'Harbour Charts' }).getByRole('button', { name: 'EPUB' })).toBeVisible();
  // Covers come down for the books on screen.
  await expect(page.locator('.catalog-cover img')).toHaveCount(2);
  expect(covers.sort()).toEqual(['/cover/1.png', '/cover/2.png']);

  // A facet narrows the same feed; Back still leaves the catalog.
  await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'French' }).click();
  await expect(page.locator('.catalog-book')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'French' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#catalogList')).toBeVisible();

  // Read opens the copy already in the library.
  await page.locator('#catalogList .row', { hasText: 'opds2.test' }).click();
  await lantern.getByRole('button', { name: 'Read' }).click();
  await expect(page.locator('.reader')).toBeVisible();
});
