// Catalog addresses, sign-in and Kindle downloads.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogAuthError, catalogFrom, downloadName, fetchText, fillSearch, parseFeed, searchTemplate, SORT_GROUP } from '../../src/lib/opds';

afterEach(() => vi.unstubAllGlobals());

describe('catalog addresses', () => {
  it('takes a home Calibre server as typed', () => {
    expect(catalogFrom('192.168.1.20:8080/opds')).toEqual({ name: '192.168.1.20', url: 'http://192.168.1.20:8080/opds' });
    expect(catalogFrom('calibre.local/opds')?.url).toBe('http://calibre.local/opds');
    expect(catalogFrom('nas:8080/opds')?.url).toBe('http://nas:8080/opds');
    expect(catalogFrom('books.example.org/opds')?.url).toBe('https://books.example.org/opds');
    expect(catalogFrom('https://books.example.org/opds')?.url).toBe('https://books.example.org/opds');
  });

  it('turns credentials in the address into a sign-in', () => {
    expect(catalogFrom('http://me:p%C3%A4ss@192.168.1.20:8080/opds')).toEqual({ name: '192.168.1.20', url: 'http://192.168.1.20:8080/opds', user: 'me', password: 'päss' });
  });

  it('refuses what isn’t a web address', () => {
    expect(catalogFrom('')).toBeNull();
    expect(catalogFrom('ftp://x/opds')).toBeNull();
    expect(catalogFrom('not an address')).toBeNull();
  });
});

describe('signing in', () => {
  it('sends the sign-in as UTF-8, whatever the characters', async () => {
    const seen: Record<string, string>[] = [];
    vi.stubGlobal('fetch', async (_: string, init: { headers: Record<string, string> }) => {
      seen.push(init.headers);
      return new Response('<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title></feed>');
    });
    await fetchText('http://x/opds', { id: 'c', name: 'x', url: 'http://x/opds', user: 'mé', password: 'päss€' });
    expect(atob(seen[0]!.Authorization!.slice('Basic '.length))).toBe(String.fromCharCode(...new TextEncoder().encode('mé:päss€')));
  });

  it('says when the catalog wants a sign-in', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 401 }));
    await expect(fetchText('http://x/opds', { id: 'c', name: 'x', url: 'http://x/opds' })).rejects.toBeInstanceOf(CatalogAuthError);
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    await expect(fetchText('http://x/opds', { id: 'c', name: 'x', url: 'http://x/opds' })).rejects.toThrow('500');
  });
});

describe('Kindle downloads', () => {
  it('are offered after EPUB and named for their type', () => {
    const feed = parseFeed(
      `<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title><entry><id>1</id><title>Moby: Dick</title>
<link rel="http://opds-spec.org/acquisition" href="/1.mobi" type="application/x-mobipocket-ebook"/>
<link rel="http://opds-spec.org/acquisition" href="/1.azw3" type="application/vnd.amazon.mobi8-ebook"/>
<link rel="http://opds-spec.org/acquisition" href="/1.epub" type="application/epub+zip"/></entry></feed>`,
      'http://x/',
    );
    const downloads = feed.entries[0]!.downloads;
    expect(downloads.map((d) => d.href)).toEqual(['http://x/1.epub', 'http://x/1.mobi', 'http://x/1.azw3']);
    expect(downloadName(feed.entries[0]!, downloads[1]!)).toBe('Moby  Dick.mobi');
    expect(downloadName(feed.entries[0]!, downloads[2]!)).toBe('Moby  Dick.azw3');
  });
});

describe('facets, sorting and OPDS 2', () => {
  it('reads a feed’s facets and sort links', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog" xmlns:thr="http://purl.org/syndication/thread/1.0">
      <title>All</title>
      <link rel="http://opds-spec.org/facet" href="/lang/en" title="English" opds:facetGroup="Language" opds:activeFacet="true" thr:count="120"/>
      <link rel="http://opds-spec.org/facet" href="/lang/fr" title="French" opds:facetGroup="Language"/>
      <link rel="http://opds-spec.org/sort/popular" href="/popular" title="Popular"/>
    </feed>`;
    const f = parseFeed(xml, 'https://example.org/opds/');
    expect(f.facets).toEqual([
      { href: 'https://example.org/lang/en', title: 'English', group: 'Language', active: true, count: 120 },
      { href: 'https://example.org/lang/fr', title: 'French', group: 'Language', active: false, count: null },
      { href: 'https://example.org/popular', title: 'Popular', group: SORT_GROUP, active: false, count: null },
    ]);
  });

  it('reads an OPDS 2 feed: navigation, books, groups, facets and its search template', () => {
    const json = JSON.stringify({
      metadata: { title: 'Home' },
      links: [
        { rel: 'self', href: '/opds2' },
        { rel: 'search', href: '/opds2/search{?query}', type: 'application/opds+json', templated: true },
        { rel: 'next', href: '/opds2?page=2' },
      ],
      navigation: [{ href: '/opds2/new', title: 'New', type: 'application/opds+json' }],
      publications: [
        {
          metadata: { title: 'Moby-Dick', identifier: 'urn:isbn:1', author: [{ name: 'Herman Melville' }], description: '<p>A <b>whale</b>.</p>' },
          links: [
            { rel: 'http://opds-spec.org/acquisition/open-access', href: '/b/1.pdf', type: 'application/pdf' },
            { rel: 'http://opds-spec.org/acquisition', href: '/b/1.epub', type: 'application/epub+zip' },
            { rel: 'http://opds-spec.org/acquisition/buy', href: '/buy', type: 'application/epub+zip' },
          ],
          images: [{ href: '/c/1.jpg', type: 'image/jpeg' }],
        },
      ],
      groups: [{ metadata: { title: 'Popular' }, links: [{ rel: 'self', href: '/opds2/popular' }], publications: [{ metadata: { title: 'Emma', author: 'Jane Austen' }, links: [{ rel: 'http://opds-spec.org/acquisition', href: '/b/2.epub', type: 'application/epub+zip' }] }] }],
      facets: [{ metadata: { title: 'Language' }, links: [{ href: '/opds2?lang=en', title: 'English', rel: 'self', properties: { numberOfItems: 9 } }, { href: '/opds2?lang=de', title: 'German' }] }],
    });
    const f = parseFeed(json, 'https://example.org/opds2');
    expect(f.title).toBe('Home');
    expect(f.next).toBe('https://example.org/opds2?page=2');
    expect(f.entries.map((e) => e.title)).toEqual(['New', 'Moby-Dick', 'Emma', 'Popular']);
    const moby = f.entries[1]!;
    expect(moby.author).toBe('Herman Melville');
    expect(moby.summary).toBe('A whale .');
    expect(moby.downloads.map((d) => d.href)).toEqual(['https://example.org/b/1.epub', 'https://example.org/b/1.pdf']);
    expect(moby.thumbnail).toBe('https://example.org/c/1.jpg');
    expect(f.entries[0]!.feed?.href).toBe('https://example.org/opds2/new');
    expect(f.facets.map((x) => [x.title, x.active, x.count])).toEqual([
      ['English', true, 9],
      ['German', false, null],
    ]);
    const template = searchTemplate(f.search!, 'https://example.org/opds2');
    expect(template).toBe('https://example.org/opds2/search{?query}');
    expect(fillSearch(template!, 'white whale')).toBe('https://example.org/opds2/search?query=white%20whale');
  });

  it('refuses JSON that isn’t a feed', () => {
    expect(() => parseFeed('{"hello": 1}', 'https://example.org/')).toThrow();
  });
});
