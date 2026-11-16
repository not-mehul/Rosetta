// Catalog addresses, sign-in and Kindle downloads.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CatalogAuthError, catalogFrom, downloadName, fetchText, parseFeed } from '../../src/lib/opds';

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
