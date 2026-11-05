// Markdown, plain text and HTML: one section each, with the contents read
// from the headings. (Word lives in docx.ts, because mammoth is loaded lazily.)

import { marked } from 'marked';
import { clean, headingToc } from './sanitize';
import type { DocInfo, FlowDoc } from './types';

export const decodeText = (bytes: Uint8Array) =>
  new TextDecoder()
    .decode(bytes)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');

/** YAML front matter: the fields Rosetta uses, and the body without it. */
export function frontMatter(source: string): {
  title: string;
  author: string;
  body: string;
} {
  const m = /^---\n([\s\S]*?)\n(?:---|\.\.\.)\n/.exec(source);
  if (!m) return { title: '', author: '', body: source };
  const field = (name: string) => new RegExp(`^${name}:\\s*["']?(.+?)["']?\\s*$`, 'mi').exec(m[1]!)?.[1] ?? '';
  return {
    title: field('title'),
    author: field('author'),
    body: source.slice(m[0].length),
  };
}

export function markdownToHtml(source: string): string {
  return marked.parse(source, { async: false, gfm: true, breaks: false });
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Plain text as paragraphs: blank lines separate them, single line breaks
 * inside a paragraph are kept. Short all-caps or "Chapter …" lines become headings.
 */
export function textToHtml(source: string): string {
  return source
    .split(/\n\s*\n/)
    .map((block) => block.replace(/^\n+|\s+$/g, ''))
    .filter((block) => block.trim())
    .map((block) => {
      const line = block.trim();
      if (!line.includes('\n') && line.length < 80 && (/^(chapter|part|book|prologue|epilogue)\b/i.test(line) || (/[A-Z]/.test(line) && line === line.toUpperCase() && !/[.!?,;]$/.test(line)))) {
        return `<h2>${escape(line)}</h2>`;
      }
      return `<p>${escape(block).replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

function single(html: string): FlowDoc {
  const { html: withIds, toc } = headingToc(html);
  const cleaned = clean(withIds);
  return {
    kind: 'flow',
    sections: [{ title: '', html: cleaned.html, text: cleaned.text }],
    toc,
    dispose: () => undefined,
  };
}

function firstHeading(html: string): string {
  const t = document.createElement('template');
  t.innerHTML = html;
  return (t.content.querySelector('h1') ?? t.content.querySelector('h2'))?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function openMarkdown(bytes: Uint8Array): FlowDoc {
  return single(markdownToHtml(frontMatter(decodeText(bytes)).body));
}

export function markdownInfo(bytes: Uint8Array): Omit<DocInfo, 'cover'> {
  const { title, author, body } = frontMatter(decodeText(bytes));
  return {
    format: 'md',
    title: title || firstHeading(markdownToHtml(body.slice(0, 20000))),
    author,
  };
}

export function openText(bytes: Uint8Array): FlowDoc {
  return single(textToHtml(decodeText(bytes)));
}

function parseHtml(bytes: Uint8Array): Document {
  return new DOMParser().parseFromString(decodeText(bytes), 'text/html');
}

export function openHtml(bytes: Uint8Array): FlowDoc {
  return single(parseHtml(bytes).body?.innerHTML ?? '');
}

export function htmlInfo(bytes: Uint8Array): Omit<DocInfo, 'cover'> {
  const doc = parseHtml(bytes);
  const meta = (name: string) => doc.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() ?? '';
  return {
    format: 'html',
    title: doc.title.trim() || firstHeading(doc.body?.innerHTML ?? ''),
    author: meta('author'),
  };
}
