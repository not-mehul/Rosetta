// Comic book archives (.cbz): a zip of page images in name order, with an
// optional ComicInfo.xml for the title, series and writer. Each page is a
// figure with its number under it, so places, bookmarks and progress work
// the same way they do in a book; in paged mode each image fills a page.

import { strFromU8, unzipSync } from 'fflate';
import { imageType } from './epub';
import { FormatError, type DocInfo, type FlowDoc } from './types';
import { t } from '../i18n/index.svelte';

const IMAGE = /\.(jpe?g|png|gif|webp|avif)$/i;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function pages(bytes: Uint8Array): {
  names: string[];
  files: Record<string, Uint8Array>;
} {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new FormatError(t('error.cbzZip'));
  }
  const names = Object.keys(files)
    .filter((n) => IMAGE.test(n) && !n.startsWith('__MACOSX/') && !/(^|\/)\./.test(n))
    .sort(natural);
  if (!names.length) throw new FormatError(t('error.cbzEmpty'));
  return { names, files };
}

export function isComicArchive(names: string[]): boolean {
  const files = names.filter((n) => !n.endsWith('/'));
  return files.length > 0 && files.every((n) => IMAGE.test(n) || /comicinfo\.xml$/i.test(n) || n.startsWith('__MACOSX/') || /(^|\/)\./.test(n) || /\.(txt|nfo|sfv)$/i.test(n));
}

export function cbzInfo(bytes: Uint8Array): Omit<DocInfo, 'cover'> & {
  coverBytes: Uint8Array | null;
  coverType: string;
} {
  const { names, files } = pages(bytes);
  const infoName = Object.keys(files).find((n) => /(^|\/)comicinfo\.xml$/i.test(n));
  let title = '';
  let author = '';
  let series = '';
  let seriesIndex: number | null = null;
  if (infoName) {
    try {
      const doc = new DOMParser().parseFromString(strFromU8(files[infoName]!), 'application/xml');
      const get = (n: string) => doc.getElementsByTagName(n)[0]?.textContent?.trim() ?? '';
      series = get('Series');
      const num = Number.parseFloat(get('Number'));
      seriesIndex = Number.isFinite(num) ? num : null;
      title = get('Title') || (series ? `${series}${seriesIndex !== null ? ` ${seriesIndex}` : ''}` : '');
      author = get('Writer');
    } catch {
      // No metadata: the file name stands in.
    }
  }
  return {
    format: 'cbz',
    title,
    author,
    series,
    seriesIndex,
    coverBytes: files[names[0]!]!,
    coverType: imageType(names[0]!),
  };
}

export function openCbz(bytes: Uint8Array): FlowDoc {
  const { names, files } = pages(bytes);
  const urls = names.map((n) => URL.createObjectURL(new Blob([files[n] as BlobPart], { type: imageType(n) })));
  // The figures are built here, not sanitised from a book: the only input is a blob URL and a number.
  const html = urls.map((u, i) => `<figure class="picture"><img src="${u}" alt="" loading="lazy" decoding="async"><figcaption>${i + 1}</figcaption></figure>`).join('');
  const t = document.createElement('template');
  t.innerHTML = html;
  return {
    kind: 'flow',
    pictures: true,
    sections: [{ title: '', html, text: t.content.textContent ?? '' }],
    toc: [],
    dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
