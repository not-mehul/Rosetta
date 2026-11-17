// OPDS catalogs (OPDS 1 Atom feeds, and OPDS 2 JSON): browse shelves, search,
// narrow by the feed's own facets, and download a DRM-free book straight into
// the library. Feeds are fetched only when the
// person opens a catalog; nothing else in Rosetta touches the network.

import { CapacitorHttp } from '@capacitor/core';
import { isNative } from '../platform/native';
import { bytesToBase64 } from './base64';
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

/** One of a feed's own ways to narrow or order it: a facet (by language, by subject) or a sort. */
export interface FeedFacet {
  href: string;
  title: string;
  /** Facets with the same group are alternatives ("Language", "Sort"). */
  group: string;
  /** The one showing now. */
  active: boolean;
  count: number | null;
}

export interface Feed {
  title: string;
  entries: FeedEntry[];
  next: string | null;
  /** An OpenSearch description, or a template with {searchTerms} or {?query}. */
  search: string | null;
  facets: FeedFacet[];
}

const READABLE: [RegExp, number][] = [
  [/application\/epub\+zip/i, 0],
  [/application\/pdf/i, 1],
  [/application\/x-fictionbook|fb2/i, 2],
  [/application\/(vnd\.comicbook\+zip|x-cbz)/i, 3],
  [/application\/(x-mobipocket-ebook|vnd\.amazon\.(ebook|mobi8-ebook))/i, 4],
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

/** Reads an OPDS feed: Atom (OPDS 1) or JSON (OPDS 2). `base` resolves relative links. */
export function parseFeed(source: string, base: string): Feed {
  if (/^\s*\{/.test(source)) return parseJsonFeed(source, base);
  const xml = source;
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
  const OPDS = 'http://opds-spec.org/2010/catalog';
  const facets: FeedFacet[] = kids(root, 'link')
    .map((l) => {
      const rel = l.getAttribute('rel') ?? '';
      const sort = /opds-spec\.org\/sort\//.test(rel);
      if (!sort && rel !== 'http://opds-spec.org/facet') return null;
      const count = Number(l.getAttributeNS('http://purl.org/syndication/thread/1.0', 'count') || l.getAttribute('thr:count'));
      return {
        href: resolve(l.getAttribute('href') ?? '', base),
        title: l.getAttribute('title') || (sort ? rel.split('/').pop()! : ''),
        group: sort ? SORT_GROUP : l.getAttributeNS(OPDS, 'facetGroup') || l.getAttribute('opds:facetGroup') || '',
        active: (l.getAttributeNS(OPDS, 'activeFacet') || l.getAttribute('opds:activeFacet')) === 'true',
        count: Number.isFinite(count) && count > 0 ? count : null,
      };
    })
    .filter((f): f is FeedFacet => !!f && !!f.href && !!f.title);
  return {
    title: text(root, 'title'),
    entries,
    next: feedLinks.find((l) => l.rel === 'next')?.href ?? null,
    search: feedLinks.find((l) => l.rel === 'search')?.href ?? null,
    facets,
  };
}

/** The group sort links go in, shown as "Order". */
export const SORT_GROUP = '\u0000sort';

type JsonLink = { href?: string; type?: string; rel?: string | string[]; title?: string; templated?: boolean; properties?: { numberOfItems?: number } };
type JsonContributor = string | { name?: string | Record<string, string> };
type JsonPublication = {
  metadata?: { title?: string | Record<string, string>; identifier?: string; author?: JsonContributor | JsonContributor[]; description?: string };
  links?: JsonLink[];
  images?: JsonLink[];
};
type JsonGroup = { metadata?: { title?: string }; navigation?: JsonLink[]; publications?: JsonPublication[]; links?: JsonLink[] };
type JsonFeed = JsonGroup & { facets?: { metadata?: { title?: string }; links?: JsonLink[] }[]; groups?: JsonGroup[] };

const rels = (l: JsonLink) => (Array.isArray(l.rel) ? l.rel : l.rel ? [l.rel] : []);
const plain = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' ? String(Object.values(v)[0] ?? '') : '');

/** Reads an OPDS 2 feed (application/opds+json): navigation, publications, groups and facets. */
function parseJsonFeed(text: string, base: string): Feed {
  let data: JsonFeed;
  try {
    data = JSON.parse(text) as JsonFeed;
  } catch {
    throw new Error(t('catalog.notFeed'));
  }
  if (!data || typeof data !== 'object' || (!data.metadata && !data.publications && !data.navigation && !data.groups)) throw new Error(t('catalog.notFeed'));
  const link = (l: JsonLink): FeedLink => ({ href: resolve(l.href ?? '', base), type: l.type ?? '', rel: rels(l).join(' '), title: l.title ?? '' });
  const navigation = (ls: JsonLink[] = []): FeedEntry[] =>
    ls.filter((l) => l.href).map((l) => ({ id: resolve(l.href!, base), title: l.title ?? l.href!, author: '', summary: '', feed: link(l), downloads: [], thumbnail: null }));
  const publication = (p: JsonPublication): FeedEntry => {
    const ls = p.links ?? [];
    const downloads = ls
      .filter((l) => l.href && rels(l).some((r) => /acquisition/.test(r) && !/\/(buy|borrow|subscribe|sample)/.test(r)) && rank(l.type ?? '') >= 0)
      .map(link)
      .sort((a, b) => rank(a.type) - rank(b.type));
    const authors = p.metadata?.author === undefined ? [] : Array.isArray(p.metadata.author) ? p.metadata.author : [p.metadata.author];
    const self = ls.find((l) => rels(l).includes('self'));
    const image = p.images?.find((i) => i.href && /thumbnail/.test(rels(i).join(' '))) ?? p.images?.find((i) => i.href);
    return {
      id: p.metadata?.identifier || (self?.href ? resolve(self.href, base) : '') || plain(p.metadata?.title),
      title: plain(p.metadata?.title),
      author: authors
        .map((a) => (typeof a === 'string' ? a : plain(a.name)))
        .filter(Boolean)
        .join(', '),
      summary: (p.metadata?.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      feed: null,
      downloads,
      thumbnail: image?.href ? resolve(image.href, base) : null,
    };
  };
  const entries: FeedEntry[] = [...navigation(data.navigation), ...(data.publications ?? []).map(publication)];
  // Groups (a home page's shelves) show their first books, and their own link to see the rest.
  for (const g of data.groups ?? []) {
    entries.push(...navigation(g.navigation), ...(g.publications ?? []).map(publication));
    const more = g.links?.find((l) => rels(l).includes('self') && l.href);
    if (more && g.metadata?.title) entries.push(...navigation([{ ...more, title: g.metadata.title }]));
  }
  const top = data.links ?? [];
  const search = top.find((l) => rels(l).includes('search') && l.href);
  const facets: FeedFacet[] = (data.facets ?? []).flatMap((f) =>
    (f.links ?? [])
      .filter((l) => l.href && l.title)
      .map((l) => ({ href: resolve(l.href!, base), title: l.title!, group: f.metadata?.title ?? '', active: rels(l).includes('self'), count: l.properties?.numberOfItems ?? null })),
  );
  const seen = new Set<string>();
  return {
    title: plain(data.metadata?.title),
    entries: entries.filter((e) => (e.id && !seen.has(e.id) ? (seen.add(e.id), true) : !e.id)),
    next: (() => {
      const n = top.find((l) => rels(l).includes('next') && l.href);
      return n ? resolve(n.href!, base) : null;
    })(),
    // OPDS 2 search links are URI templates ("…/search{?query}"); kept as they are.
    search: search ? (search.templated ? search.href! : resolve(search.href!, base)) : null,
    facets,
  };
}

/** The search template from an OpenSearch description, or the link itself if it already is one. */
export function searchTemplate(xmlOrTemplate: string, base: string): string | null {
  if (/\{searchTerms\}|\{\?query[^}]*\}/.test(xmlOrTemplate) && !xmlOrTemplate.trimStart().startsWith('<')) return resolveTemplate(xmlOrTemplate, base);
  const doc = new DOMParser().parseFromString(xmlOrTemplate, 'application/xml');
  const urls = [...doc.getElementsByTagNameNS('*', 'Url')];
  const url = urls.find((u) => /atom/i.test(u.getAttribute('type') ?? '')) ?? urls[0];
  const template = url?.getAttribute('template');
  return template ? resolve(template, base) : null;
}

/** Resolves a relative template against the feed without mangling its {braces}. */
function resolveTemplate(template: string, base: string): string {
  const parts: string[] = [];
  const masked = template.replace(/\{[^}]*\}/g, (m) => `__rosetta${parts.push(m) - 1}__`);
  return resolve(masked, base).replace(/__rosetta(\d+)__/g, (_, i: string) => parts[Number(i)] ?? '');
}

export const fillSearch = (template: string, terms: string) =>
  template
    // OPDS 2's URI templates: {?query} and its friends.
    .replace(/\{\?([^}]+)\}/, (_, names: string) => {
      const name = names.split(',').includes('query') ? 'query' : names.split(',')[0];
      return `?${name}=${encodeURIComponent(terms)}`;
    })
    .replace('{searchTerms}', encodeURIComponent(terms))
    .replace(/\{[a-zA-Z:]+\?\}/g, '')
    .replace(/\{startPage\}/, '1')
    .replace(/\{count\}/, '20');

/** Basic auth, as UTF-8 (btoa alone throws on anything outside Latin-1). */
const auth = (c: Catalog): Record<string, string> => (c.user ? { Authorization: `Basic ${bytesToBase64(new TextEncoder().encode(`${c.user}:${c.password ?? ''}`))}` } : {});

/** The catalog wants a user name and password (or the ones it has were wrong). */
export class CatalogAuthError extends Error {
  constructor() {
    super(t('catalog.signInNeeded'));
  }
}

function check(status: number): void {
  if (status === 401) throw new CatalogAuthError();
  if (status >= 400) throw new Error(t('catalog.answered', { status }));
}

/**
 * A catalog from the address typed in. Credentials in it ("http://me:pw@host/opds")
 * become its sign-in; an address without a scheme gets http:// when it's a home
 * server (an IP address, localhost or a port, as Calibre's usually is), https:// otherwise.
 */
export function catalogFrom(address: string): Omit<Catalog, 'id'> | null {
  let text = address.trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    const host = text.split(/[/?#]/)[0]!;
    text = `${/^(\d{1,3}(\.\d{1,3}){3}|localhost|[^:]+\.local)(:\d+)?$|:\d+$/i.test(host) ? 'http' : 'https'}://${text}`;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname) return null;
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  url.username = '';
  url.password = '';
  return { name: url.hostname, url: url.toString(), ...(user ? { user, password } : {}) };
}

const ACCEPT = 'application/atom+xml, application/opds+json, application/xml, application/json;q=0.9, */*;q=0.8';

/** Fetches text from a catalog. Native goes through CapacitorHttp, which catalogs' CORS rules don't block. */
export async function fetchText(url: string, catalog: Catalog): Promise<string> {
  if (isNative) {
    const res = await CapacitorHttp.get({
      url,
      headers: {
        Accept: ACCEPT,
        ...auth(catalog),
      },
      responseType: 'text',
    });
    check(res.status);
    return typeof res.data === 'string' ? res.data : String(res.data);
  }
  const res = await fetch(url, {
    headers: {
      Accept: ACCEPT,
      ...auth(catalog),
    },
  });
  check(res.status);
  return res.text();
}

export async function fetchBytes(url: string, catalog: Catalog): Promise<Uint8Array> {
  if (isNative) {
    const res = await CapacitorHttp.get({
      url,
      headers: auth(catalog),
      responseType: 'arraybuffer',
    });
    check(res.status);
    // Native returns base64 for binary responses.
    const data = res.data as string;
    return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  }
  const res = await fetch(url, { headers: auth(catalog) });
  check(res.status);
  return new Uint8Array(await res.arrayBuffer());
}

/** File extensions by download type, first match wins. */
const EXTENSIONS: [RegExp, string][] = [
  [/epub/, 'epub'],
  [/pdf/, 'pdf'],
  [/fictionbook|fb2/, 'fb2'],
  [/comicbook|cbz/, 'cbz'],
  [/mobi8/, 'azw3'],
  [/mobipocket|amazon/, 'mobi'],
  [/html/, 'html'],
];

/** A file name for a download, from its title and type. */
export function downloadName(entry: Pick<FeedEntry, 'title'>, link: FeedLink): string {
  const ext = EXTENSIONS.find(([re]) => re.test(link.type))?.[1] ?? 'txt';
  return `${entry.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Download'}.${ext}`;
}
