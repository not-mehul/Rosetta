// Every document's HTML passes through here before it reaches the page.
// Scripts, forms, frames and inline styles go (the reader sets the type, not
// the publisher), ids and classes are prefixed so they can't collide with the
// app's own (a book's CSS, when kept, is rewritten to match; see styles.ts),
// and image and link targets are resolved by the caller.

import DOMPurify from 'dompurify';
import type { TocEntry } from './types';

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
const FORBID_ATTR = ['align', 'bgcolor', 'color', 'face', 'size', 'background', 'border', 'tabindex', 'contenteditable'];

/** Removes anything in CSS that would reach the network: a book must read offline and privately. */
export function offlineCss(css: string): string {
  return css
    .replace(/url\(\s*(['"]?)\s*(?:https?:|\/\/)[^)]*\)/gi, 'none')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(');
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
      if (options.keepStyle) el.setAttribute('style', offlineCss(style));
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
        el.setAttribute('data-link', `#${ID_PREFIX}${decodeURIComponent(href.slice(1))}`);
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
