// OpenDocument text (.odt): content.xml's headings, paragraphs, lists,
// tables, links and images, with bold and italic read from the automatic
// styles; meta.xml gives the title and author.

import { strFromU8, unzipSync } from 'fflate';
import { imageType } from './epub';
import { clean, headingToc } from './sanitize';
import { FormatError, type DocInfo, type FlowDoc } from './types';
import { t } from '../i18n/index.svelte';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';

function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes);
  } catch {
    throw new FormatError(t('error.odtZip'));
  }
}

function xml(data: Uint8Array | undefined): Document | null {
  if (!data) return null;
  const doc = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
  return doc.getElementsByTagName('parsererror').length ? null : doc;
}

export function odtInfo(bytes: Uint8Array): Omit<DocInfo, 'cover'> {
  const meta = xml(unzip(bytes)['meta.xml']);
  const get = (name: string) => meta?.getElementsByTagNameNS('*', name)[0]?.textContent?.trim() ?? '';
  return {
    format: 'odt',
    title: get('title'),
    author: get('creator') || get('initial-creator'),
  };
}

export function openOdt(bytes: Uint8Array): FlowDoc {
  const files = unzip(bytes);
  const content = xml(files['content.xml']);
  if (!content) throw new FormatError(t('error.odtEmpty'));
  // Which automatic styles are bold or italic.
  const styles = new Map<string, { b: boolean; i: boolean }>();
  for (const s of content.getElementsByTagNameNS('*', 'style')) {
    const props = [...s.children].find((c) => c.localName === 'text-properties');
    if (!props) continue;
    const attr = (n: string) => props.getAttribute(`fo:${n}`) ?? props.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0', n) ?? '';
    styles.set(s.getAttribute('style:name') ?? '', {
      b: attr('font-weight') === 'bold',
      i: attr('font-style') === 'italic',
    });
  }
  const urls: string[] = [];

  const walk = (el: Element): string => {
    const inner = () => [...el.childNodes].map((n) => (n.nodeType === Node.TEXT_NODE ? esc(n.nodeValue ?? '') : n.nodeType === Node.ELEMENT_NODE ? walk(n as Element) : '')).join('');
    const style = styles.get(el.getAttribute('text:style-name') ?? '');
    const wrap = (html: string) => (style?.i ? `<em>${style?.b ? `<strong>${html}</strong>` : html}</em>` : style?.b ? `<strong>${html}</strong>` : html);
    switch (el.localName) {
      case 'h': {
        const level = Math.min(6, Number(el.getAttribute('text:outline-level')) || 1);
        return `<h${level}>${inner()}</h${level}>`;
      }
      case 'p':
        return `<p>${wrap(inner())}</p>`;
      case 'span':
        return wrap(inner());
      case 's':
        return ' '.repeat(Number(el.getAttribute('text:c')) || 1);
      case 'tab':
        return '\t';
      case 'line-break':
        return '<br>';
      case 'list':
        return `<ul>${inner()}</ul>`;
      case 'list-item':
        return `<li>${inner()}</li>`;
      case 'a':
        return `<a href="${esc(el.getAttribute('xlink:href') ?? '')}">${inner()}</a>`;
      case 'note': {
        const body = [...el.children].find((c) => c.localName === 'note-body');
        const cite = [...el.children].find((c) => c.localName === 'note-citation')?.textContent ?? '*';
        return `<sup>${esc(cite)}</sup>${
          body
            ? `<span class="note">[${walk(body)
                .replace(/<\/?p>/g, ' ')
                .trim()}]</span>`
            : ''
        }`;
      }
      case 'table':
        return `<table>${inner()}</table>`;
      case 'table-row':
        return `<tr>${inner()}</tr>`;
      case 'table-cell':
        return `<td>${inner()}</td>`;
      case 'image': {
        const path = el.getAttribute('xlink:href') ?? '';
        const data = files[path];
        if (!data) return '';
        const url = URL.createObjectURL(new Blob([data as BlobPart], { type: imageType(path) }));
        urls.push(url);
        return `<img src="${url}" alt="">`;
      }
      case 'frame':
        return [...el.children].map(walk).join('');
      case 'tracked-changes':
      case 'sequence-decls':
      case 'annotation':
        return '';
      default:
        return el.namespaceURI === TEXT || el.localName === 'text' || el.localName === 'body' || el.localName === 'section' ? inner() : [...el.children].map(walk).join('');
    }
  };
  const body = content.getElementsByTagNameNS('*', 'text')[0];
  const html = body ? walk(body) : '';
  const { html: withIds, toc } = headingToc(html);
  const cleaned = clean(withIds, {
    resolveSrc: (src) => (src.startsWith('blob:') ? src : null),
  });
  return {
    kind: 'flow',
    sections: [{ title: '', html: cleaned.html, text: cleaned.text }],
    toc,
    dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
