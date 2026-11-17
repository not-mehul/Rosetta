// Settings and reading preferences, with their allowed values.

export type ThemeSetting = 'system' | 'dark' | 'light';
/** 'custom' is a font file the reader added (see platform/fonts.ts). */
export type Typeface = 'serif' | 'sans' | 'custom';
export type Spacing = 'compact' | 'normal' | 'loose';
export type Measure = 'narrow' | 'medium' | 'wide';
export type PageTone = 'original' | 'theme';
export type LibrarySort = 'recent' | 'title' | 'author' | 'series';
export type LibraryShelf = 'reading' | 'all' | 'finished';
/** The library as a grid of covers, or as a list of rows. */
export type LibraryLayout = 'grid' | 'list';
export type PdfFit = 'width' | 'page';
/** A PDF as its pages, or as its words laid out in the reading column. */
export type PdfView = 'pages' | 'text';
/** Flow shows one sentence at a time in the middle of the screen, revealed a letter at a time. */
export type ReadingMode = 'scroll' | 'paged' | 'flow';
export type PageTurn = 'curl' | 'slide' | 'none';
export type LocaleSetting = 'system' | 'en' | 'es' | 'fr' | 'de';
/** What the reader's footer shows on the left; a tap moves to the next. */
export type FooterShows = 'book' | 'chapter' | 'place';
/** Minutes a day, or 0 for no goal. */
export const DAILY_GOALS = [0, 15, 30, 60] as const;
/** Books a year, or 0 for no goal. */
export const YEARLY_GOALS = [0, 6, 12, 24, 52] as const;

export interface Settings {
  theme: ThemeSetting;
  /** Dusk on true black, for OLED screens. */
  oled: boolean;
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
  pdfView: PdfView;
  /** Flow documents scroll, turn one screen at a time, or flow a sentence at a time. */
  readingMode: ReadingMode;
  /** Flow mode: letters revealed a second. */
  flowSpeed: number;
  /** Visual anchors: the start of each word in bold, for the eye to land on. */
  anchors: boolean;
  /** The name of the reader's own font file, when one was added. */
  customFont: string;
  /** How a page turns in paged mode. Reduce-motion always means none. */
  pageTurn: PageTurn;
  /** Paged mode on a wide screen held sideways: two pages side by side, as an open book. */
  spreads: boolean;
  /** Auto-scroll's pace, in lines a minute. */
  autoScrollSpeed: number;
  /** A band over the line being read, the rest of the page dimmed. */
  ruler: boolean;
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
  /** When the last automatic backup was written. */
  lastAutoBackup: number;
  sort: LibrarySort;
  shelf: LibraryShelf;
  layout: LibraryLayout;
  /** Time left in the book, time left in the chapter, or which chapter. */
  footerShows: FooterShows;
  /** Minutes of reading a day to aim for; 0 is no goal. */
  dailyGoal: number;
  /** Books to finish this year; 0 is no goal. */
  yearlyGoal: number;
  /** The Monday of the last week whose recap was put away. */
  recapSeen: string;
  /** The document open when the app last closed. */
  lastDocId: string | null;
}

export const FONT_SIZES = { min: 14, max: 28, step: 1 } as const;
export const PDF_ZOOM = { min: 0.5, max: 4 } as const;
export const SPEECH_RATE = { min: 0.5, max: 2 } as const;
export const FLOW_SPEED = { min: 10, max: 120, step: 5 } as const;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  oled: false,
  typeface: 'serif',
  fontSize: 18,
  spacing: 'normal',
  measure: 'medium',
  justify: false,
  pageTone: 'original',
  pdfZoom: 1,
  pdfFit: 'width',
  pdfView: 'pages',
  readingMode: 'scroll',
  flowSpeed: 40,
  anchors: false,
  customFont: '',
  pageTurn: 'curl',
  spreads: true,
  autoScrollSpeed: 12,
  ruler: false,
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
  lastAutoBackup: 0,
  sort: 'recent',
  shelf: 'all',
  layout: 'grid',
  footerShows: 'book',
  dailyGoal: 0,
  yearlyGoal: 0,
  recapSeen: '',
  lastDocId: null,
};

const CHOICES: Partial<Record<keyof Settings, readonly unknown[]>> = {
  theme: ['system', 'dark', 'light'],
  typeface: ['serif', 'sans', 'custom'],
  spacing: ['compact', 'normal', 'loose'],
  measure: ['narrow', 'medium', 'wide'],
  pageTone: ['original', 'theme'],
  pdfFit: ['width', 'page'],
  pdfView: ['pages', 'text'],
  readingMode: ['scroll', 'paged', 'flow'],
  pageTurn: ['curl', 'slide', 'none'],
  locale: ['system', 'en', 'es', 'fr', 'de'],
  sort: ['recent', 'title', 'author', 'series'],
  shelf: ['reading', 'all', 'finished'],
  layout: ['grid', 'list'],
  footerShows: ['book', 'chapter', 'place'],
  dailyGoal: DAILY_GOALS,
  yearlyGoal: YEARLY_GOALS,
};

/** Numbers kept within their range: [min, max]. */
const RANGES: Partial<Record<keyof Settings, readonly [number, number]>> = {
  fontSize: [FONT_SIZES.min, FONT_SIZES.max],
  pdfZoom: [PDF_ZOOM.min, PDF_ZOOM.max],
  dim: [0, 0.7],
  warmth: [0, 1],
  speechRate: [SPEECH_RATE.min, SPEECH_RATE.max],
  flowSpeed: [FLOW_SPEED.min, FLOW_SPEED.max],
  autoScrollSpeed: [4, 60],
};

/**
 * The settings a document keeps for itself. A new document reads with the
 * defaults; a change made while it is open is remembered for it alone.
 */
export const BOOK_KEYS = ['typeface', 'fontSize', 'spacing', 'measure', 'justify', 'readingMode', 'publisherStyles', 'pdfZoom', 'pdfFit', 'pdfView', 'pageTone', 'flowSpeed', 'anchors'] as const satisfies readonly (keyof Settings)[];
export type BookKey = (typeof BOOK_KEYS)[number];
export type BookSettings = Partial<Pick<Settings, BookKey>>;

export const isBookKey = (key: string): key is BookKey => (BOOK_KEYS as readonly string[]).includes(key);

/** A document's own settings, keeping only the ones that fit. */
export function cleanBookSettings(raw: unknown): BookSettings {
  if (!raw || typeof raw !== 'object') return {};
  const given = raw as Record<string, unknown>;
  const valid = mergeSettings(given as Partial<Record<keyof Settings, unknown>>);
  const out: Record<string, unknown> = {};
  for (const key of BOOK_KEYS) if (key in given && JSON.stringify(valid[key]) === JSON.stringify(given[key])) out[key] = valid[key];
  return out as BookSettings;
}

/** The settings a document reads with: the defaults, under its own. */
export function settingsFor(defaults: Settings, own: BookSettings | undefined): Settings {
  if (!own) return defaults;
  const out = { ...defaults, ...cleanBookSettings(own) };
  // A font file of one's own that has since been removed.
  if (out.typeface === 'custom' && !defaults.customFont) out.typeface = defaults.typeface === 'custom' ? 'serif' : defaults.typeface;
  return out;
}

/** Kept to this device: what a backup leaves out of the settings it carries. */
const DEVICE_ONLY = ['lastAutoBackup', 'lastDocId', 'customFont', 'sync', 'recapSeen'] as const satisfies readonly (keyof Settings)[];

/** The settings a backup carries: everything but what belongs to this device. */
export function portableSettings(s: Settings): Partial<Settings> {
  const out: Partial<Settings> = { ...s };
  for (const key of DEVICE_ONLY) delete out[key];
  return out;
}

/** Settings restored from a backup over the ones in use. */
export function restoredSettings(current: Settings, backedUp: unknown): Settings {
  if (!backedUp || typeof backedUp !== 'object') return current;
  const given = backedUp as Partial<Record<keyof Settings, unknown>>;
  const incoming = mergeSettings(given);
  const out: Settings = { ...current };
  const writable = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(given) as (keyof Settings)[]) {
    if ((DEVICE_ONLY as readonly string[]).includes(key) || !(key in DEFAULT_SETTINGS)) continue;
    // A value that doesn't fit leaves the one in use alone.
    if (JSON.stringify(incoming[key]) === JSON.stringify(given[key])) writable[key] = incoming[key];
  }
  return out;
}

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
