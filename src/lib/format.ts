// Small formatting helpers for the UI, in the reader's language.

import { locale, t } from '../i18n/index.svelte';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString(locale())} ${n === 1 ? one : many}`;

/** Reading time: "45 min", "3 h 10 min". */
export function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? t('time.hoursMinutes', { h, m }) : t('time.hours', { count: h });
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function relativeDay(when: number, now = Date.now()): string {
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(when).setHours(0, 0, 0, 0)) / 86400000);
  if (days < 7) return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-Math.max(0, days), 'day');
  return new Date(when).toLocaleDateString(locale(), {
    day: 'numeric',
    month: 'short',
    year: new Date(when).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric',
  });
}

/** An object URL for bytes, for <img>; the caller revokes it. */
export function blobUrl(bytes: Uint8Array | null | undefined, type = 'image/jpeg'): string | null {
  return bytes?.length ? URL.createObjectURL(new Blob([bytes as BlobPart], { type })) : null;
}
