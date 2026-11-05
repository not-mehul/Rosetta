// A book's own CSS, kept for "publisher styles" and fixed-layout pages. It is
// rewritten before it touches the page: selectors are scoped to the reading
// column and use the prefixed ids and classes (sanitize.ts), anything that
// reaches the network is dropped, and the properties the reader controls
// (colour, typeface, line spacing, position) are left to the reader.

import { ID_PREFIX, offlineCss } from './sanitize';

/** Properties a book may not set over the reader's theme and type. */
const READER_OWNS =
  /^(color|background(-color|-image)?|font-family|font|line-height|position|z-index|top|right|bottom|left|-webkit-text-fill-color|opacity|filter|mix-blend-mode|transform|transition|animation.*|cursor|pointer-events|user-select|-webkit-user-select)$/i;

export interface ScopeOptions {
  /** The selector everything is placed under. */
  scope: string;
  /** Fixed layout keeps every property: the page is the publisher's drawing. */
  keepAll?: boolean;
  /** Maps a url() inside the CSS (fonts, backgrounds) to one the page can load. */
  resolveUrl?: (url: string) => string | null;
}

function scopeSelector(selector: string, scope: string): string {
  return selector
    .split(',')
    .map((part) => {
      let s = part.trim();
      if (!s) return '';
      // Ids and classes as sanitize.ts rewrote them; leave attribute selectors and strings alone.
      s = s.replace(/(\[[^\]]*\])|([.#])(-?[_a-zA-Z][\w-]*)/g, (_m, attr: string | undefined, sigil: string, name: string) => (attr ? attr : `${sigil}${ID_PREFIX}${name}`));
      // html and body are the reading column.
      s = s.replace(/^(?:html\s*)?(?:body)?(?=[\s.#:[>+~]|$)/i, (m) => (m ? scope : m)).trim();
      if (s === scope || s.startsWith(`${scope} `) || s.startsWith(`${scope}.`) || s.startsWith(`${scope}:`) || s.startsWith(`${scope}>`)) return s;
      return `${scope} ${s}`;
    })
    .filter(Boolean)
    .join(', ');
}

function filterDeclarations(block: string, options: ScopeOptions): string {
  return block
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const colon = d.indexOf(':');
      if (colon < 1) return '';
      const prop = d.slice(0, colon).trim();
      let value = d
        .slice(colon + 1)
        .replace(/!important/gi, '')
        .trim();
      if (!options.keepAll && READER_OWNS.test(prop)) return '';
      // Fixed font sizes would ignore the reader's size; relative ones scale with it.
      if (!options.keepAll && /^font-size$/i.test(prop) && /\d(px|pt|cm|mm|in|pc)\b/i.test(value)) return '';
      value = value.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, _q, url: string) => {
        if (/^data:/i.test(url)) return m;
        const resolved = options.resolveUrl?.(url.trim());
        return resolved ? `url("${resolved}")` : 'none';
      });
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join('; ');
}

/** Rewrites a stylesheet for the page. Unknown at-rules are dropped, @media is kept. */
export function scopeCss(css: string, options: ScopeOptions): string {
  const source = offlineCss(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  let out = '';
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf('{', i);
    if (open < 0) break;
    const head = source.slice(i, open).trim();
    // Find the matching brace.
    let depth = 1;
    let j = open + 1;
    while (j < source.length && depth) {
      if (source[j] === '{') depth++;
      else if (source[j] === '}') depth--;
      j++;
    }
    const body = source.slice(open + 1, j - 1);
    i = j;
    // A stray statement at-rule (@charset, @namespace) sits before the head.
    const cleanHead = head.replace(/@(charset|namespace|import)[^;]*;/gi, '').trim();
    if (cleanHead.startsWith('@')) {
      if (/^@media/i.test(cleanHead)) {
        const inner = scopeCss(body, options);
        if (inner) out += `${cleanHead} {\n${inner}}\n`;
      } else if (/^@font-face/i.test(cleanHead) && options.keepAll) {
        out += `@font-face { ${filterDeclarations(body, { ...options, keepAll: true })} }\n`;
      }
      continue;
    }
    const selector = scopeSelector(cleanHead, options.scope);
    const decls = filterDeclarations(body, options);
    if (selector && decls) out += `${selector} { ${decls} }\n`;
  }
  return out;
}
