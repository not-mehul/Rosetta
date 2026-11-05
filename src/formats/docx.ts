// Word documents (.docx): mammoth turns the paragraphs, headings, lists,
// tables, footnotes and images into HTML; the core properties give the title
// and author. Loaded only when a Word file is opened.

import { strFromU8, unzipSync } from 'fflate';
import { clean, headingToc } from './sanitize';
import { FormatError, type DocInfo, type FlowDoc } from './types';
import { t } from '../i18n/index.svelte';

export function docxInfo(bytes: Uint8Array): Omit<DocInfo, 'cover'> {
  let title = '';
  let author = '';
  try {
    const core = unzipSync(bytes, {
      filter: (f) => f.name === 'docProps/core.xml',
    })['docProps/core.xml'];
    if (core) {
      const doc = new DOMParser().parseFromString(strFromU8(core), 'application/xml');
      title = doc.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() ?? '';
      author = doc.getElementsByTagNameNS('*', 'creator')[0]?.textContent?.trim() ?? '';
    }
  } catch {
    // No properties: the file name stands in.
  }
  return { format: 'docx', title, author };
}

export async function openDocx(bytes: Uint8Array): Promise<FlowDoc> {
  const { default: mammoth } = await import('mammoth/mammoth.browser.js');
  let html: string;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    html = (await mammoth.convertToHtml({ arrayBuffer: buffer })).value;
  } catch (err) {
    throw new FormatError(t('error.docx', { reason: err instanceof Error ? err.message : String(err) }));
  }
  const { html: withIds, toc } = headingToc(html);
  const cleaned = clean(withIds);
  return {
    kind: 'flow',
    sections: [{ title: '', html: cleaned.html, text: cleaned.text }],
    toc,
    dispose: () => undefined,
  };
}
