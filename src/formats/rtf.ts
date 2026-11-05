// Rich Text Format: paragraphs, bold, italic, underline and Unicode, read
// from the control words. Fonts, colours, pictures and the document's own
// layout are skipped; the reader sets the type.

import { clean, headingToc } from './sanitize';
import { FormatError, type DocInfo, type FlowDoc } from './types';
import { t } from '../i18n/index.svelte';

/** Destinations whose text is not part of the document. */
const SKIP = new Set([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'info',
  'pict',
  'object',
  'header',
  'footer',
  'headerl',
  'headerr',
  'footerl',
  'footerr',
  'xmlnstbl',
  'listtable',
  'listoverridetable',
  'rsidtbl',
  'generator',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'fldinst',
  'filetbl',
  'revtbl',
  'pgdsctbl',
  'operator',
  'author',
  'title',
  'company',
]);

interface State {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  skip: boolean;
  /** Characters to skip after \uN (\ucN). */
  uc: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function rtfToHtml(source: string): {
  html: string;
  title: string;
  author: string;
} {
  if (!source.startsWith('{\\rtf')) throw new FormatError(t('error.rtf'));
  const title = /\{\\title\s+([^}]*)\}/.exec(source)?.[1]?.trim() ?? '';
  const author = /\{\\author\s+([^}]*)\}/.exec(source)?.[1]?.trim() ?? '';

  const stack: State[] = [];
  let st: State = {
    bold: false,
    italic: false,
    underline: false,
    skip: false,
    uc: 1,
  };
  const paras: string[] = [];
  let run = '';
  let para = '';
  let runFmt = '';
  let pendingSkip = 0;
  let destStart = false;

  const fmt = () => `${st.bold ? 'b' : ''}${st.italic ? 'i' : ''}${st.underline ? 'u' : ''}`;
  const flushRun = () => {
    if (!run) return;
    let html = esc(run);
    if (runFmt.includes('u')) html = `<u>${html}</u>`;
    if (runFmt.includes('i')) html = `<em>${html}</em>`;
    if (runFmt.includes('b')) html = `<strong>${html}</strong>`;
    para += html;
    run = '';
  };
  const emit = (text: string) => {
    if (st.skip) return;
    if (pendingSkip > 0) {
      const n = Math.min(pendingSkip, text.length);
      pendingSkip -= n;
      text = text.slice(n);
      if (!text) return;
    }
    const f = fmt();
    if (f !== runFmt) {
      flushRun();
      runFmt = f;
    }
    run += text;
  };
  const endPara = () => {
    flushRun();
    paras.push(para);
    para = '';
  };

  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    if (c === '{') {
      stack.push({ ...st });
      destStart = true;
      i++;
      continue;
    }
    if (c === '}') {
      flushRun();
      st = stack.pop() ?? st;
      i++;
      continue;
    }
    if (c === '\\') {
      const next = source[i + 1] ?? '';
      if (next === '\\' || next === '{' || next === '}') {
        emit(next);
        i += 2;
        destStart = false;
        continue;
      }
      if (next === '*') {
        // An ignorable destination we don't know: skip it.
        st.skip = true;
        i += 2;
        continue;
      }
      if (next === "'") {
        const hex = source.slice(i + 2, i + 4);
        emit(new TextDecoder('windows-1252').decode(new Uint8Array([Number.parseInt(hex, 16) || 32])));
        i += 4;
        destStart = false;
        continue;
      }
      if (next === '~') {
        emit('\u00a0');
        i += 2;
        continue;
      }
      if (next === '-' || next === '_') {
        i += 2;
        continue;
      }
      if (next === '\n' || next === '\r') {
        endPara();
        i += 2;
        continue;
      }
      const m = /^([a-z]{1,32})(-?\d{1,10})? ?/i.exec(source.slice(i + 1, i + 46));
      if (!m) {
        i += 2;
        continue;
      }
      const word = m[1]!;
      const arg = m[2] === undefined ? null : Number(m[2]);
      i += 1 + m[0].length;
      if (destStart && SKIP.has(word)) st.skip = true;
      destStart = false;
      switch (word) {
        case 'par':
        case 'sect':
        case 'page':
          endPara();
          break;
        case 'line':
          flushRun();
          para += '<br>';
          break;
        case 'tab':
          emit('\t');
          break;
        case 'b':
          st.bold = arg !== 0;
          break;
        case 'i':
          st.italic = arg !== 0;
          break;
        case 'ul':
          st.underline = arg !== 0;
          break;
        case 'ulnone':
          st.underline = false;
          break;
        case 'plain':
          st.bold = st.italic = st.underline = false;
          break;
        case 'uc':
          st.uc = arg ?? 1;
          break;
        case 'u': {
          const code = arg === null ? 63 : arg < 0 ? arg + 65536 : arg;
          emit(String.fromCharCode(code));
          pendingSkip = st.uc;
          break;
        }
        case 'emdash':
          emit('—');
          break;
        case 'endash':
          emit('–');
          break;
        case 'lquote':
          emit('‘');
          break;
        case 'rquote':
          emit('’');
          break;
        case 'ldblquote':
          emit('“');
          break;
        case 'rdblquote':
          emit('”');
          break;
        case 'bullet':
          emit('•');
          break;
        default:
          break;
      }
      continue;
    }
    if (c === '\r' || c === '\n') {
      i++;
      continue;
    }
    destStart = false;
    // A run of plain text up to the next control character.
    let j = i;
    while (j < source.length && !'\\{}\r\n'.includes(source[j]!)) j++;
    emit(source.slice(i, j));
    i = j;
  }
  endPara();
  const html = paras
    .map((p) => p.trim())
    .filter((p) => p.replace(/<[^>]+>/g, '').trim())
    .map((p) => `<p>${p}</p>`)
    .join('\n');
  return { html, title, author };
}

const decode = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

export function rtfInfo(bytes: Uint8Array): Omit<DocInfo, 'cover'> {
  const { title, author } = rtfToHtml(decode(bytes.subarray(0, 200_000)));
  return { format: 'rtf', title, author };
}

export function openRtf(bytes: Uint8Array): FlowDoc {
  const { html } = rtfToHtml(decode(bytes));
  const { html: withIds, toc } = headingToc(html);
  const cleaned = clean(withIds);
  return {
    kind: 'flow',
    sections: [{ title: '', html: cleaned.html, text: cleaned.text }],
    toc,
    dispose: () => undefined,
  };
}
