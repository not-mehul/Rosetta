// FictionBook 2 (.fb2): one XML file with the description (title, authors,
// series, language), bodies of nested sections, and images as base64
// binaries. The top-level sections become chapters; a body named "notes"
// holds the footnotes, which the reader shows in place.

import { clean } from './sanitize';
import { FormatError, type DocInfo, type FlowDoc, type Section, type TocEntry } from './types';
import { decodeText } from './flow';
import { t } from '../i18n/index.svelte';

const byLocal = (root: Document | Element, name: string) => [...root.getElementsByTagNameNS('*', name)];
const child = (el: Element, name: string) => [...el.children].find((c) => c.localName === name);
const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = (el: Element) => el.getAttribute('l:href') ?? el.getAttribute('xlink:href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? el.getAttribute('href') ?? '';

function parse(bytes: Uint8Array): Document {
  // FB2 declares its encoding; most are UTF-8, older Russian ones windows-1251.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const encoding = /encoding=["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase() ?? 'utf-8';
  let source: string;
  try {
    source = encoding === 'utf-8' ? decodeText(bytes) : new TextDecoder(encoding).decode(bytes);
  } catch {
    source = decodeText(bytes);
  }
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'FictionBook') throw new FormatError(t('error.fb2Xml'));
  return doc;
}

function authorName(a: Element): string {
  return squash(['first-name', 'middle-name', 'last-name'].map((n) => child(a, n)?.textContent ?? '').join(' ')) || squash(child(a, 'nickname')?.textContent);
}

function describe(doc: Document) {
  const info = byLocal(doc, 'title-info')[0];
  const seq = info ? child(info, 'sequence') : undefined;
  const index = Number.parseFloat(seq?.getAttribute('number') ?? '');
  return {
    title: squash(info && child(info, 'book-title')?.textContent),
    author: info
      ? [...info.children]
          .filter((c) => c.localName === 'author')
          .map(authorName)
          .filter(Boolean)
          .join(', ')
      : '',
    lang: squash(info && child(info, 'lang')?.textContent),
    series: seq?.getAttribute('name')?.trim() ?? '',
    seriesIndex: Number.isFinite(index) ? index : null,
    coverId: info ? href(child(child(info, 'coverpage') ?? info, 'image') ?? info).replace(/^#/, '') : '',
  };
}

function binaries(doc: Document): Map<string, { type: string; data: string }> {
  const out = new Map<string, { type: string; data: string }>();
  for (const b of byLocal(doc, 'binary'))
    out.set(b.getAttribute('id') ?? '', {
      type: b.getAttribute('content-type') ?? 'image/jpeg',
      data: (b.textContent ?? '').replace(/\s+/g, ''),
    });
  return out;
}

/** FB2 markup to HTML. */
function toHtml(el: Element, images: Map<string, { type: string; data: string }>, depth: number): string {
  const inner = () => [...el.childNodes].map((n) => (n.nodeType === Node.TEXT_NODE ? esc(n.nodeValue ?? '') : n.nodeType === Node.ELEMENT_NODE ? toHtml(n as Element, images, depth) : '')).join('');
  const id = el.getAttribute('id') ? ` id="${esc(el.getAttribute('id')!)}"` : '';
  switch (el.localName) {
    case 'section':
      return `<section${id}>${[...el.children].map((c) => toHtml(c, images, depth + 1)).join('')}</section>`;
    case 'title': {
      const h = Math.min(6, depth + 1);
      return `<h${h}${id}>${[...el.children]
        .map((c) => squash(c.textContent))
        .filter(Boolean)
        .map(esc)
        .join('<br>')}</h${h}>`;
    }
    case 'subtitle':
      return `<h${Math.min(6, depth + 2)}${id}>${inner()}</h${Math.min(6, depth + 2)}>`;
    case 'p':
      return `<p${id}>${inner()}</p>`;
    case 'empty-line':
      return '<p><br></p>';
    case 'emphasis':
      return `<em>${inner()}</em>`;
    case 'strong':
      return `<strong>${inner()}</strong>`;
    case 'strikethrough':
      return `<s>${inner()}</s>`;
    case 'sup':
    case 'sub':
    case 'code':
      return `<${el.localName}>${inner()}</${el.localName}>`;
    case 'epigraph':
    case 'cite':
      return `<blockquote${id}>${inner()}</blockquote>`;
    case 'text-author':
      return `<p><em>${inner()}</em></p>`;
    case 'poem':
      return `<div class="poem"${id}>${inner()}</div>`;
    case 'stanza':
      return `<p class="stanza">${[...el.children].map((c) => (c.localName === 'v' ? `${[...c.childNodes].map((n) => (n.nodeType === Node.ELEMENT_NODE ? toHtml(n as Element, images, depth) : esc(n.nodeValue ?? ''))).join('')}<br>` : toHtml(c, images, depth))).join('')}</p>`;
    case 'a': {
      const target = href(el);
      const note = el.getAttribute('type') === 'note' ? ' epub:type="noteref"' : '';
      return `<a href="${esc(target)}"${note}>${inner()}</a>`;
    }
    case 'image': {
      const img = images.get(href(el).replace(/^#/, ''));
      return img ? `<p><img src="data:${esc(img.type)};base64,${img.data}" alt="${esc(el.getAttribute('alt') ?? '')}"></p>` : '';
    }
    case 'table':
      return `<table>${inner()}</table>`;
    case 'tr':
    case 'td':
    case 'th':
      return `<${el.localName}>${inner()}</${el.localName}>`;
    default:
      return inner();
  }
}

export function fb2Info(bytes: Uint8Array): Omit<DocInfo, 'cover'> & {
  coverBytes: Uint8Array | null;
  coverType: string;
} {
  const doc = parse(bytes);
  const d = describe(doc);
  const img = d.coverId ? binaries(doc).get(d.coverId) : undefined;
  let coverBytes: Uint8Array | null = null;
  if (img) {
    try {
      coverBytes = Uint8Array.from(atob(img.data), (c) => c.charCodeAt(0));
    } catch {
      coverBytes = null;
    }
  }
  return {
    format: 'fb2',
    title: d.title,
    author: d.author,
    series: d.series,
    seriesIndex: d.seriesIndex,
    coverBytes,
    coverType: img?.type ?? '',
  };
}

export function openFb2(bytes: Uint8Array): FlowDoc {
  const doc = parse(bytes);
  const d = describe(doc);
  const images = binaries(doc);
  const bodies = byLocal(doc, 'body');
  const main = bodies.find((b) => !b.getAttribute('name')) ?? bodies[0];
  if (!main) throw new FormatError(t('error.fb2Empty'));
  const notes = bodies.filter((b) => b !== main);

  // Footnotes live in the notes body; they're appended to every chapter that
  // links to them, hidden, so the note popover and the jump both find them.
  const noteHtml = new Map<string, string>();
  for (const body of notes) for (const s of byLocal(body, 'section')) if (s.getAttribute('id')) noteHtml.set(s.getAttribute('id')!, toHtml(s, images, 1));

  const parts = [...main.children].filter((c) => c.localName === 'section');
  const chapters = parts.length ? parts : [main];
  const sections: Section[] = [];
  const toc: TocEntry[] = [];
  chapters.forEach((part, i) => {
    let html = toHtml(part, images, 0);
    const linked = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!).filter((id) => noteHtml.has(id));
    if (linked.length)
      html += `<aside epub:type="footnotes" class="notes">${[...new Set(linked)].map((id) => `<aside epub:type="footnote" id="${esc(id)}">${noteHtml.get(id)}</aside>`).join('')}</aside>`;
    const cleaned = clean(html);
    const title = squash(child(part, 'title')?.textContent) || `Part ${i + 1}`;
    sections.push({ title, html: cleaned.html, text: cleaned.text });
    toc.push({ label: title, section: i, depth: 0 });
  });
  return {
    kind: 'flow',
    sections,
    toc,
    lang: d.lang || undefined,
    dispose: () => undefined,
  };
}
