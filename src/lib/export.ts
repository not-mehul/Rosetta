// Notes out, and annotations backed up and restored. Backups carry places,
// bookmarks and highlights, not the files themselves; on restore they rejoin
// the documents already in the library by their fingerprint.

import type { Collection, Mark, StoredDoc } from '../state/db';
import { t } from '../i18n/index.svelte';

export function notesMarkdown(doc: Pick<StoredDoc, 'title' | 'author'>, marks: readonly Mark[]): string {
  const lines = [`# ${doc.title}`, ''];
  if (doc.author) lines.push(`*${doc.author}*`, '');
  const highlights = marks.filter((m) => m.kind === 'highlight').sort((a, b) => a.section - b.section || a.start - b.start);
  let where = '';
  for (const h of highlights) {
    if (h.where && h.where !== where) {
      where = h.where;
      lines.push(`## ${where}`, '');
    }
    lines.push(`> ${h.text.replace(/\n+/g, ' ')}`, '');
    if (h.note.trim()) lines.push(h.note.trim(), '');
  }
  const bookmarks = marks.filter((m) => m.kind === 'bookmark');
  if (bookmarks.length) {
    lines.push('## Bookmarks', '');
    for (const b of bookmarks.sort((a, z) => a.section - z.section || a.start - z.start)) lines.push(`- ${b.where}${b.text ? `: ${b.text.slice(0, 80)}…` : ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

export const slug = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'notes';

type BackedUpDoc = Pick<StoredDoc, 'id' | 'title' | 'author' | 'fileName' | 'location' | 'progress' | 'finishedAt' | 'openedAt'> &
  Partial<Pick<StoredDoc, 'format' | 'size' | 'addedAt' | 'tags' | 'collections' | 'series' | 'seriesIndex' | 'updatedAt'>> & { marks: Mark[] };

export interface Backup {
  app: 'rosetta';
  /** 1: places and marks. 2 adds details, tags, collections and deleted marks (for sync). */
  version: 1 | 2;
  exportedAt: string;
  docs: BackedUpDoc[];
  collections?: Collection[];
  /** Marks deleted, so a merge deletes them too. */
  deleted?: { id: string; deletedAt: number }[];
}

export function makeBackup(docs: readonly StoredDoc[], marks: readonly Mark[], now = new Date(), collections: readonly Collection[] = [], deleted: { id: string; deletedAt: number }[] = []): Backup {
  return {
    app: 'rosetta',
    version: 2,
    exportedAt: now.toISOString(),
    collections: [...collections],
    deleted,
    docs: docs.map((d) => ({
      id: d.id,
      title: d.title,
      author: d.author,
      fileName: d.fileName,
      format: d.format,
      size: d.size,
      addedAt: d.addedAt,
      location: d.location,
      progress: d.progress,
      finishedAt: d.finishedAt,
      openedAt: d.openedAt,
      tags: d.tags,
      collections: d.collections,
      series: d.series,
      seriesIndex: d.seriesIndex,
      updatedAt: d.updatedAt,
      marks: marks.filter((m) => m.docId === d.id),
    })),
  };
}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t('error.notBackup'));
  }
  const b = data as Partial<Backup>;
  if (b?.app !== 'rosetta' || (b.version !== 1 && b.version !== 2) || !Array.isArray(b.docs)) throw new Error(t('error.notBackup'));
  return b as Backup;
}
