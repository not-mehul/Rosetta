// Every document's HTML passes through here before it reaches the page.
// Scripts, forms, frames and inline styles go (the reader sets the type, not
// the publisher), ids and classes are prefixed so they can't collide with the
// app's own (a book's CSS, when kept, is rewritten to match; see styles.ts),
// and image and link targets are resolved by the caller.

import DOMPurify from 'dompurify';
import type { TocEntry } from './types';
import { safeDecode } from '../lib/uri';

export const ID_PREFIX = 'r-';

export interface CleanOptions {
  /** Maps an image src to a URL the page can load, or null to drop the image. */
  resolveSrc?: (src: string) => string | null;
  /**
   * Maps a link to an internal target ("3#r-note") or null for an external
   * link. Same-document "#x" links are handled here.
   */
  resolveLink?: (href: string) => string | null;
  /** Keep inline style attributes (fixed-layout pages, whose positions live there). */
  keepStyle?: boolean;
}

export interface Cleaned {
  html: string;
  text: string;
}

const FORBID_TAGS = ['style', 'script', 'form', 'input', 'button', 'select', 'textarea', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'video', 'audio', 'source', 'track', 'noscript', 'title'];
// srcset and sizes would let a picture load from the web in place of the book's own.
const FORBID_ATTR = ['align', 'bgcolor', 'color', 'face', 'size', 'background', 'border', 'tabindex', 'contenteditable', 'srcset', 'sizes'];

/** Removes anything in CSS that would reach the network: a book must read offline and privately. */
export function offlineCss(css: string): string {
  return css
    .replace(/url\(\s*(['"]?)\s*(?:https?:|\/\/)[^)]*\)/gi, 'none')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(');
}

/**
 * A block of CSS declarations split at its semicolons, but not at the ones
 * inside strings or brackets: a data: URI holds one ("data:font/woff2;base64,").
 */
export function declarations(block: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let from = 0;
  for (let i = 0; i < block.length; i++) {
    const c = block[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) {
      out.push(block.slice(from, i));
      from = i + 1;
    }
  }
  out.push(block.slice(from));
  return out.map((d) => d.trim()).filter(Boolean);
}

/** CSS functions whose strings are URLs, which url() rewriting doesn't see. */
const URL_STRINGS = /(?:-webkit-)?image-set\s*\(|(?:^|[\s,(])src\s*\(/i;
const URL_FUNCTION = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]*))\s*\)/gi;

/**
 * A declaration's value with every url() pointing at a file in the book
 * (through `resolve`), a data: URI, or nothing. Null when the value can't be
 * made safe: URL strings in image-set(), or CSS escapes outside a string,
 * which can spell "url(" or "http" in a way the patterns here can't read.
 */
export function offlineValue(value: string, resolve?: (url: string) => string | null): string | null {
  const bare = value.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  if (bare.includes('\\') || URL_STRINGS.test(bare)) return null;
  return value.replace(URL_FUNCTION, (m, dq?: string, sq?: string, raw?: string) => {
    const url = (dq ?? sq ?? raw ?? '').trim();
    if (/^data:/i.test(url)) return m;
    if (url.includes('\\')) return 'none';
    const resolved = resolve?.(url);
    return resolved ? `url("${resolved}")` : 'none';
  });
}

/** An inline style attribute kept for a fixed-layout page, with nothing in it that reaches the network. */
export function offlineStyle(style: string, resolve?: (url: string) => string | null): string {
  return declarations(style)
    .map((d) => {
      const colon = d.indexOf(':');
      if (colon < 1) return '';
      const value = offlineValue(d.slice(colon + 1).trim(), resolve);
      return value === null ? '' : `${d.slice(0, colon).trim()}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

/** The text a container's textContent will have once `html` is rendered in it. */
export function textOf(html: string): string {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.textContent ?? '';
}

export function clean(html: string, options: CleanOptions = {}): Cleaned {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (!el.getAttribute) return;
    const id = el.getAttribute('id');
    if (id) el.setAttribute('id', ID_PREFIX + id);
    const cls = el.getAttribute('class');
    if (cls) {
      const prefixed = cls
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => ID_PREFIX + c)
        .join(' ');
      if (prefixed) el.setAttribute('class', prefixed);
      else el.removeAttribute('class');
    }
    const style = el.getAttribute('style');
    if (style !== null) {
      const kept = options.keepStyle ? offlineStyle(style, options.resolveSrc) : '';
      if (kept) el.setAttribute('style', kept);
      else el.removeAttribute('style');
    }
    // name anchors are how older books mark footnotes.
    if (el.tagName === 'A' && el.getAttribute('name') && !id) el.setAttribute('id', ID_PREFIX + el.getAttribute('name'));

    if (el.tagName === 'IMG' || el.tagName.toLowerCase() === 'image') {
      const attr = el.tagName === 'IMG' ? 'src' : el.hasAttribute('href') ? 'href' : 'xlink:href';
      const src = el.getAttribute(attr) ?? '';
      const resolved = /^data:image\//i.test(src) ? src : options.resolveSrc ? options.resolveSrc(src) : null;
      if (resolved) {
        el.setAttribute(attr, resolved);
        if (el.tagName === 'IMG') {
          el.setAttribute('loading', 'lazy');
          el.setAttribute('decoding', 'async');
        }
      } else if (el.tagName === 'IMG') {
        // A missing image keeps its alt text in the flow.
        el.replaceWith(document.createTextNode(el.getAttribute('alt') ?? ''));
      } else {
        el.remove();
      }
      return;
    }

    if (el.tagName === 'A' && el.hasAttribute('href')) {
      const href = el.getAttribute('href')!.trim();
      if (href.startsWith('#')) {
        el.setAttribute('data-link', `#${ID_PREFIX}${safeDecode(href.slice(1))}`);
        el.setAttribute('href', `#${ID_PREFIX}${href.slice(1)}`);
        return;
      }
      const internal = /^[a-z][a-z0-9+.-]*:/i.test(href) ? null : (options.resolveLink?.(href) ?? null);
      if (internal) {
        el.setAttribute('data-link', internal);
        el.setAttribute('href', '#');
      } else if (/^(https?:|mailto:)/i.test(href)) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      } else {
        el.removeAttribute('href');
      }
    }
  });
  try {
    const out = DOMPurify.sanitize(html, {
      FORBID_TAGS,
      FORBID_ATTR: options.keepStyle ? FORBID_ATTR : [...FORBID_ATTR, 'style', 'width', 'height'],
      ADD_ATTR: ['epub:type', 'xlink:href', 'data-link', 'role', 'lang', 'dir'],
      ALLOW_DATA_ATTR: false,
      USE_PROFILES: { html: true, svg: true },
    });
    return { html: out, text: textOf(out) };
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes');
  }
}

/**
 * Gives every h1–h3 an id (when it has none) and lists them, for documents
 * that are one section: Markdown, Word, text and HTML.
 */
export function headingToc(html: string): { html: string; toc: TocEntry[] } {
  const t = document.createElement('template');
  t.innerHTML = html;
  const toc: TocEntry[] = [];
  const headings = [...t.content.querySelectorAll('h1, h2, h3')];
  const top = Math.min(...headings.map((h) => Number(h.tagName[1])));
  headings.forEach((h, i) => {
    const label = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!label) return;
    // clean() prefixes every id, so the contents point at the prefixed one.
    if (!h.id) h.id = `h${i}`;
    toc.push({
      label,
      section: 0,
      anchor: ID_PREFIX + h.id,
      depth: Number(h.tagName[1]) - top,
    });
  });
  return { html: t.innerHTML, toc };
}
