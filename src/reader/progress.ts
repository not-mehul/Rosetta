// Where the reader is, and how far through.

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

/** Time left at about 250 words a minute, from the characters left. */
export function timeLeft(charsLeft: number): string {
  const minutes = Math.round(charsLeft / 6 / 250);
  if (minutes < 1) return 'Under a minute left';
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}
