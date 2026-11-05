// OPDS catalogs (Atom feeds of books): browse shelves, search, and download
// a DRM-free book straight into the library. Feeds are fetched only when the
// person opens a catalog; nothing else in Rosetta touches the network.

import { CapacitorHttp } from '@capacitor/core';
import { isNative } from '../platform/native';
import { t } from '../i18n/index.svelte';

export interface Catalog {
  id: string;
  name: string;
  url: string;
  /** Basic auth for a Calibre or private server. */
  user?: string;
  password?: string;
}

export const PRESETS: Catalog[] = [
  {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    url: 'https://www.gutenberg.org/ebooks.opds/',
  },
  {
    id: 'standard-ebooks',
    name: 'Standard Ebooks',
    url: 'https://standardebooks.org/feeds/opds',
  },
];

export interface FeedLink {
  href: string;
  type: string;
  rel: string;
  title: string;
}

export interface FeedEntry {
  id: string;
  title: string;
  author: string;
  summary: string;
  /** A sub-feed to open (navigation). */
  feed: FeedLink | null;
  /** Downloads Rosetta can read, best first. */
  downloads: FeedLink[];
  thumbnail: string | null;
}

export interface Feed {
  title: string;
  entries: FeedEntry[];
  next: string | null;
  /** An OpenSearch description, or a template with {searchTerms}. */
  search: string | null;
}

const READABLE: [RegExp, number][] = [
  [/application\/epub\+zip/i, 0],
  [/application\/pdf/i, 1],
  [/application\/x-fictionbook|fb2/i, 2],
  [/application\/(vnd\.comicbook\+zip|x-cbz)/i, 3],
  [/text\/html/i, 5],
  [/text\/plain/i, 6],
];

const rank = (type: string) => READABLE.find(([re]) => re.test(type))?.[1] ?? -1;

function resolve(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Reads an OPDS (Atom) feed. `base` resolves relative links. */
export function parseFeed(xml: string, base: string): Feed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'feed') throw new Error(t('catalog.notFeed'));
  const kids = (el: Element, name: string) => [...el.children].filter((c) => c.localName === name);
  const text = (el: Element, name: string) => kids(el, name)[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const links = (el: Element): FeedLink[] =>
    kids(el, 'link').map((l) => ({
      href: resolve(l.getAttribute('href') ?? '', base),
      type: l.getAttribute('type') ?? '',
      rel: l.getAttribute('rel') ?? '',
      title: l.getAttribute('title') ?? '',
    }));
  const root = doc.documentElement;
  const feedLinks = links(root);
  const entries = kids(root, 'entry').map((e): FeedEntry => {
    const ls = links(e);
    const downloads = ls.filter((l) => /acquisition/.test(l.rel) && !/\/(buy|borrow|subscribe|sample)/.test(l.rel) && rank(l.type) >= 0).sort((a, b) => rank(a.type) - rank(b.type));
    const feed = ls.find((l) => /profile=opds-catalog|application\/atom\+xml/i.test(l.type) && !/acquisition|image|thumbnail/.test(l.rel)) ?? null;
    return {
      id: text(e, 'id') || ls[0]?.href || text(e, 'title'),
      title: text(e, 'title'),
      author: kids(e, 'author')
        .map((a) => text(a, 'name'))
        .filter(Boolean)
        .join(', '),
      summary: text(e, 'summary') || text(e, 'content'),
      feed: downloads.length ? null : feed,
      downloads,
      thumbnail: ls.find((l) => /thumbnail/.test(l.rel))?.href ?? ls.find((l) => /opds-spec.org\/image$/.test(l.rel))?.href ?? null,
    };
  });
  return {
    title: text(root, 'title'),
    entries,
    next: feedLinks.find((l) => l.rel === 'next')?.href ?? null,
    search: feedLinks.find((l) => l.rel === 'search')?.href ?? null,
  };
}

/** The search template from an OpenSearch description, or the link itself if it already is one. */
export function searchTemplate(xmlOrTemplate: string, base: string): string | null {
  if (xmlOrTemplate.includes('{searchTerms}') && !xmlOrTemplate.trimStart().startsWith('<')) return xmlOrTemplate;
  const doc = new DOMParser().parseFromString(xmlOrTemplate, 'application/xml');
  const urls = [...doc.getElementsByTagNameNS('*', 'Url')];
  const url = urls.find((u) => /atom/i.test(u.getAttribute('type') ?? '')) ?? urls[0];
  const template = url?.getAttribute('template');
  return template ? resolve(template, base) : null;
}

export const fillSearch = (template: string, terms: string) =>
  template
    .replace('{searchTerms}', encodeURIComponent(terms))
    .replace(/\{[a-zA-Z:]+\?\}/g, '')
    .replace(/\{startPage\}/, '1')
    .replace(/\{count\}/, '20');

const auth = (c: Catalog): Record<string, string> => (c.user ? { Authorization: `Basic ${btoa(`${c.user}:${c.password ?? ''}`)}` } : {});

/** Fetches text from a catalog. Native goes through CapacitorHttp, which catalogs' CORS rules don't block. */
export async function fetchText(url: string, catalog: Catalog): Promise<string> {
  if (isNative) {
    const res = await CapacitorHttp.get({
      url,
      headers: {
        Accept: 'application/atom+xml, application/xml, */*',
        ...auth(catalog),
      },
      responseType: 'text',
    });
    if (res.status >= 400) throw new Error(`The catalog answered ${res.status}.`);
    return typeof res.data === 'string' ? res.data : String(res.data);
  }
  const res = await fetch(url, {
    headers: {
      Accept: 'application/atom+xml, application/xml, */*',
      ...auth(catalog),
    },
  });
  if (!res.ok) throw new Error(`The catalog answered ${res.status}.`);
  return res.text();
}

export async function fetchBytes(url: string, catalog: Catalog): Promise<Uint8Array> {
  if (isNative) {
    const res = await CapacitorHttp.get({
      url,
      headers: auth(catalog),
      responseType: 'arraybuffer',
    });
    if (res.status >= 400) throw new Error(`The catalog answered ${res.status}.`);
    // Native returns base64 for binary responses.
    const data = res.data as string;
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  }
  const res = await fetch(url, { headers: auth(catalog) });
  if (!res.ok) throw new Error(`The catalog answered ${res.status}.`);
  return new Uint8Array(await res.arrayBuffer());
}

/** A file name for a download, from its title and type. */
export function downloadName(entry: Pick<FeedEntry, 'title'>, link: FeedLink): string {
  const ext = /epub/.test(link.type)
    ? 'epub'
    : /pdf/.test(link.type)
      ? 'pdf'
      : /fictionbook|fb2/.test(link.type)
        ? 'fb2'
        : /comicbook|cbz/.test(link.type)
          ? 'cbz'
          : /html/.test(link.type)
            ? 'html'
            : 'txt';
  return `${entry.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Download'}.${ext}`;
}
