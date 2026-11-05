// Settings and reading preferences, with their allowed values.

export type ThemeSetting = 'system' | 'dark' | 'light';
export type Typeface = 'serif' | 'sans';
export type Spacing = 'compact' | 'normal' | 'loose';
export type Measure = 'narrow' | 'medium' | 'wide';
export type PageTone = 'original' | 'theme';
export type LibrarySort = 'recent' | 'title' | 'author' | 'series';
export type LibraryShelf = 'reading' | 'all' | 'finished';
export type PdfFit = 'width' | 'page';
export type ReadingMode = 'scroll' | 'paged';
export type PageTurn = 'curl' | 'slide' | 'none';
export type LocaleSetting = 'system' | 'en' | 'es' | 'fr' | 'de';

export interface Settings {
  theme: ThemeSetting;
  typeface: Typeface;
  /** Body size in px. */
  fontSize: number;
  spacing: Spacing;
  measure: Measure;
  justify: boolean;
  /** PDF pages as printed, or inverted to match Dusk. */
  pageTone: PageTone;
  /** PDF page width, as a multiple of the fitted width (pinch sets any value in range). */
  pdfZoom: number;
  /** What "fitted" means for a PDF page: the column's width, or the whole page on screen. */
  pdfFit: PdfFit;
  /** Flow documents scroll, or turn one screen at a time. */
  readingMode: ReadingMode;
  /** How a page turns in paged mode. Reduce-motion always means none. */
  pageTurn: PageTurn;
  /** Volume keys turn pages (Android). */
  volumeKeys: boolean;
  /** Keep the screen on while a document is open. */
  keepAwake: boolean;
  /** 0 (off) … 0.7: a dimming layer over the page. */
  dim: number;
  /** 0 (off) … 1: a warm layer for night reading. */
  warmth: number;
  /** Keep a book's own styling (drop caps, indents, poetry) under the reader's theme. */
  publisherStyles: boolean;
  /** A light tick on marks. */
  haptics: boolean;
  /** Read-aloud speed, 0.5…2. */
  speechRate: number;
  /** A voice's identifier, or '' for the system default. */
  voice: string;
  /** A dated backup to Documents each week (native). */
  autoBackup: boolean;
  /** Merge places and marks with the sync file in the sync folder. */
  sync: boolean;
  /** The collection the library shows, or '' for every document. */
  collection: string;
  locale: LocaleSetting;
  /** OPDS catalogs the reader added (the built-in ones aren't stored). */
  catalogs: {
    id: string;
    name: string;
    url: string;
    user?: string;
    password?: string;
  }[];
  /** When the last automatic backup was written. */
  lastAutoBackup: number;
  sort: LibrarySort;
  shelf: LibraryShelf;
  /** The document open when the app last closed. */
  lastDocId: string | null;
}

export const FONT_SIZES = { min: 14, max: 28, step: 1 } as const;
export const PDF_ZOOM = { min: 0.5, max: 4 } as const;
export const SPEECH_RATE = { min: 0.5, max: 2 } as const;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  typeface: 'serif',
  fontSize: 18,
  spacing: 'normal',
  measure: 'medium',
  justify: false,
  pageTone: 'original',
  pdfZoom: 1,
  pdfFit: 'width',
  readingMode: 'scroll',
  pageTurn: 'curl',
  volumeKeys: true,
  keepAwake: false,
  dim: 0,
  warmth: 0,
  publisherStyles: false,
  haptics: true,
  speechRate: 1,
  voice: '',
  autoBackup: true,
  sync: false,
  collection: '',
  locale: 'system',
  catalogs: [],
  lastAutoBackup: 0,
  sort: 'recent',
  shelf: 'all',
  lastDocId: null,
};

const CHOICES: Partial<Record<keyof Settings, readonly unknown[]>> = {
  theme: ['system', 'dark', 'light'],
  typeface: ['serif', 'sans'],
  spacing: ['compact', 'normal', 'loose'],
  measure: ['narrow', 'medium', 'wide'],
  pageTone: ['original', 'theme'],
  pdfFit: ['width', 'page'],
  readingMode: ['scroll', 'paged'],
  pageTurn: ['curl', 'slide', 'none'],
  locale: ['system', 'en', 'es', 'fr', 'de'],
  sort: ['recent', 'title', 'author', 'series'],
  shelf: ['reading', 'all', 'finished'],
};

/** Numbers kept within their range: [min, max]. */
const RANGES: Partial<Record<keyof Settings, readonly [number, number]>> = {
  fontSize: [FONT_SIZES.min, FONT_SIZES.max],
  pdfZoom: [PDF_ZOOM.min, PDF_ZOOM.max],
  dim: [0, 0.7],
  warmth: [0, 1],
  speechRate: [SPEECH_RATE.min, SPEECH_RATE.max],
};

/** Stored settings over the defaults, dropping anything that doesn't fit. */
export function mergeSettings(stored: Partial<Record<keyof Settings, unknown>> | undefined): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!stored) return out;
  const writable = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = stored[key];
    if (value === undefined) continue;
    const choices = CHOICES[key];
    if (choices) {
      if (choices.includes(value)) writable[key] = value;
    } else if (RANGES[key]) {
      const [min, max] = RANGES[key]!;
      if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) writable[key] = key === 'fontSize' ? Math.round(value) : value;
    } else if (key === 'catalogs') {
      if (Array.isArray(value)) out.catalogs = value.filter((c) => c && typeof c.url === 'string' && typeof c.name === 'string' && typeof c.id === 'string');
    } else if (key === 'lastDocId') {
      if (value === null || typeof value === 'string') out.lastDocId = value;
    } else if (typeof value === typeof DEFAULT_SETTINGS[key]) {
      writable[key] = value;
    }
  }
  return out;
}

/** CSS values for the reading column. */
export const SPACING_VALUE: Record<Spacing, number> = {
  compact: 1.45,
  normal: 1.65,
  loose: 1.9,
};
export const MEASURE_VALUE: Record<Measure, string> = {
  narrow: '32em',
  medium: '38em',
  wide: '46em',
};
