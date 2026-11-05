// Where the reader is, and how far through.

import { t } from '../i18n/index.svelte';

export interface Location {
  /** Section index (a page, for PDF). */
  section: number;
  /** Character offset in the section's text; for PDF, the fraction of the page scrolled past, ×10000. */
  offset: number;
}

export const START: Location = { section: 0, offset: 0 };

/** Fraction read, 0…1, weighting each section by its length. */
export function flowProgress(lengths: readonly number[], at: Location): number {
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return lengths.length ? Math.min(1, at.section / lengths.length) : 0;
  let before = 0;
  for (let i = 0; i < at.section && i < lengths.length; i++) before += lengths[i]!;
  return Math.max(0, Math.min(1, (before + Math.min(at.offset, lengths[at.section] ?? 0)) / total));
}

export function pageProgress(pageCount: number, at: Location): number {
  if (pageCount <= 1) return at.offset / 10000;
  return Math.max(0, Math.min(1, (at.section + at.offset / 10000) / pageCount));
}

/** The location a fraction of the way through a flow document. */
export function flowLocationAt(lengths: readonly number[], fraction: number): Location {
  const total = lengths.reduce((a, b) => a + b, 0);
  let target = Math.round(Math.max(0, Math.min(1, fraction)) * total);
  for (let i = 0; i < lengths.length; i++) {
    if (target < lengths[i]! || i === lengths.length - 1) return { section: i, offset: Math.min(target, lengths[i]!) };
    target -= lengths[i]!;
  }
  return START;
}

export const percent = (fraction: number) => `${Math.floor(fraction * 100)}%`;

/** About 250 words a minute, in characters: the pace before the reader's own is known. */
export const DEFAULT_PACE = 250 * 6;

/** Time left from the characters left, at `pace` characters a minute. */
export function timeLeft(charsLeft: number, pace = DEFAULT_PACE): string {
  const minutes = Math.round(charsLeft / Math.max(100, pace));
  if (minutes < 1) return t('stats.leftUnder');
  if (minutes < 60) return t('stats.leftMin', { min: minutes });
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? t('stats.leftHoursMin', { h, min: m }) : t('stats.leftHours', { h });
}

/** Characters from the start of a flow document to a place. */
export function globalOffset(lengths: readonly number[], at: Location): number {
  let n = 0;
  for (let i = 0; i < at.section && i < lengths.length; i++) n += lengths[i]!;
  return n + Math.min(at.offset, lengths[at.section] ?? 0);
}

/** Where chapters start, as characters from the start, sorted and without repeats. */
export function chapterOffsets(lengths: readonly number[], starts: readonly Location[]): number[] {
  return [...new Set(starts.map((s) => globalOffset(lengths, s)))].sort((a, b) => a - b);
}

/** The chapter boundaries as fractions of the document, for ticks on the meter. */
export function chapterTicks(lengths: readonly number[], starts: readonly Location[], max = 60): number[] {
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!total) return [];
  const ticks = chapterOffsets(lengths, starts)
    .map((o) => o / total)
    .filter((f) => f > 0.004 && f < 0.996);
  // Past a point, ticks are noise rather than chapters.
  return ticks.length > max ? [] : ticks;
}

/** The chapter a place is in: its number (from 1) and how many there are. */
export function chapterAt(lengths: readonly number[], starts: readonly Location[], at: Location): { index: number; count: number; charsLeft: number } {
  const offsets = chapterOffsets(lengths, starts);
  const total = lengths.reduce((a, b) => a + b, 0);
  const here = globalOffset(lengths, at);
  let index = 0;
  while (index < offsets.length && offsets[index]! <= here) index++;
  const next = offsets[index] ?? total;
  return { index: Math.max(1, index), count: Math.max(1, offsets.length), charsLeft: Math.max(0, next - here) };
}

/** A jump is worth coming back from when it lands more than a few screens away. */
export const FAR_CHARS = 3000;
