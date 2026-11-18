// Comic book archives (.cbz): a zip of page images in name order, with an
// optional ComicInfo.xml for the title, series and writer. Each page is a
// figure with its number under it, so places, bookmarks and progress work
// the same way they do in a book; in paged mode each image fills a page.

import { strFromU8, unzipSync } from 'fflate';
import { imageType } from './epub';
import { IMAGE } from './sniff';
import { FormatError, type DocInfo, type FlowDoc } from './types';
import { t } from '../i18n/index.svelte';

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

/** ComicInfo.xml, read: its fields by name, or empty when there is none. */
function comicInfo(files: Record<string, Uint8Array>): (name: string) => string {
  const infoName = Object.keys(files).find((n) => /(^|\/)comicinfo\.xml$/i.test(n));
  if (!infoName) return () => '';
  try {
    const doc = new DOMParser().parseFromString(strFromU8(files[infoName]!), 'application/xml');
    return (n: string) => doc.getElementsByTagName(n)[0]?.textContent?.trim() ?? '';
  } catch {
    return () => '';
  }
}

/** Manga read right to left: ComicInfo says so with Manga = YesAndRightToLeft. */
export const readsRightToLeft = (manga: string) => /^yesandrighttoleft$/i.test(manga.trim());

export function cbzInfo(bytes: Uint8Array): Omit<DocInfo, 'cover'> & {
  coverBytes: Uint8Array | null;
  coverType: string;
} {
  const { names, files } = pages(bytes);
  const get = comicInfo(files);
  const series = get('Series');
  const num = Number.parseFloat(get('Number'));
  const seriesIndex = Number.isFinite(num) ? num : null;
  // No metadata: the file name stands in.
  const title = get('Title') || (series ? `${series}${seriesIndex !== null ? ` ${seriesIndex}` : ''}` : '');
  const author = get('Writer');
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
    ...(readsRightToLeft(comicInfo(files)('Manga')) ? { dir: 'rtl' as const } : {}),
    sections: [{ title: '', html, text: t.content.textContent ?? '' }],
    toc: [],
    dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
