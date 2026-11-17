// Settings and reading preferences, with their allowed values.

export type ThemeSetting = 'system' | 'dark' | 'light';
export type Typeface = 'serif' | 'sans';
export type Spacing = 'compact' | 'normal' | 'loose';
export type Measure = 'narrow' | 'medium' | 'wide';
export type PageTone = 'original' | 'theme';
export type LibrarySort = 'recent' | 'title' | 'author' | 'series';
/** Which documents the library shows, by how far along they are. */
export type LibraryShelf = 'all' | 'reading' | 'unread' | 'finished';
/** The library as a grid of covers, or as a list of rows. */
export type LibraryLayout = 'grid' | 'list';
export type PdfFit = 'width' | 'page';
/** A PDF as its pages, or as its words laid out in the reading column. */
export type PdfView = 'pages' | 'text';
/** Flow shows one sentence at a time in the middle of the screen, revealed a letter at a time. */
export type ReadingMode = 'scroll' | 'paged' | 'flow';
export type PageTurn = 'curl' | 'slide' | 'none';
export type LocaleSetting = 'system' | 'en' | 'es' | 'fr' | 'de' | 'ru';
/** How often an automatic backup is written. */
export type BackupFrequency = 'off' | 'daily' | 'weekly' | 'monthly';
/** Night light: the page dimmed and warmed together, in five steps. */
export type NightLight = 'off' | 'soft' | 'warm' | 'evening' | 'night';
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
  /** The page dimmed and warmed for night reading (NIGHT_LIGHT). */
  nightLight: NightLight;
  /** Keep a book's own styling (drop caps, indents, poetry) under the reader's theme. */
  publisherStyles: boolean;
  /** A light tick on marks. */
  haptics: boolean;
  /** Read-aloud speed, 0.5…2. */
  speechRate: number;
  /** A voice's identifier, or '' for the system default. */
  voice: string;
  /** A dated backup in the sync folder (or Documents/Rosetta/backups on a phone) this often. */
  autoBackup: BackupFrequency;
  /** Merge places and marks with the sync file in the sync folder. */
  sync: boolean;
  /** When this device last synced. */
  lastSync: number;
  /** A notification once a day, at reminderTime, unless the day's reading is done. */
  reminder: boolean;
  /** "HH:MM", 24-hour. */
  reminderTime: string;
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
  pageTurn: 'curl',
  spreads: true,
  autoScrollSpeed: 12,
  ruler: false,
  volumeKeys: true,
  keepAwake: false,
  nightLight: 'off',
  publisherStyles: false,
  haptics: true,
  speechRate: 1,
  voice: '',
  autoBackup: 'weekly',
  sync: false,
  lastSync: 0,
  reminder: false,
  reminderTime: '20:00',
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
  typeface: ['serif', 'sans'],
  spacing: ['compact', 'normal', 'loose'],
  measure: ['narrow', 'medium', 'wide'],
  pageTone: ['original', 'theme'],
  pdfFit: ['width', 'page'],
  pdfView: ['pages', 'text'],
  readingMode: ['scroll', 'paged', 'flow'],
  pageTurn: ['curl', 'slide', 'none'],
  locale: ['system', 'en', 'es', 'fr', 'de', 'ru'],
  autoBackup: ['off', 'daily', 'weekly', 'monthly'],
  nightLight: ['off', 'soft', 'warm', 'evening', 'night'],
  sort: ['recent', 'title', 'author', 'series'],
  shelf: ['all', 'reading', 'unread', 'finished'],
  layout: ['grid', 'list'],
  footerShows: ['book', 'chapter', 'place'],
  dailyGoal: DAILY_GOALS,
  yearlyGoal: YEARLY_GOALS,
};

/** Numbers kept within their range: [min, max]. */
const RANGES: Partial<Record<keyof Settings, readonly [number, number]>> = {
  fontSize: [FONT_SIZES.min, FONT_SIZES.max],
  pdfZoom: [PDF_ZOOM.min, PDF_ZOOM.max],
  speechRate: [SPEECH_RATE.min, SPEECH_RATE.max],
  flowSpeed: [FLOW_SPEED.min, FLOW_SPEED.max],
  autoScrollSpeed: [4, 60],
};

/**
 * The settings a document keeps for itself. A new document reads with the
 * defaults; a change made while it is open is remembered for it alone.
 */
export const BOOK_KEYS = ['typeface', 'fontSize', 'spacing', 'justify', 'readingMode', 'publisherStyles', 'pdfZoom', 'pdfFit', 'pdfView', 'pageTone'] as const satisfies readonly (keyof Settings)[];
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
  return { ...defaults, ...cleanBookSettings(own) };
}

/** Kept to this device: what a backup leaves out of the settings it carries. */
const DEVICE_ONLY = ['lastAutoBackup', 'lastDocId', 'sync', 'lastSync', 'recapSeen', 'reminder'] as const satisfies readonly (keyof Settings)[];

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
    // Automatic backups were on or off (weekly) before they had a frequency.
    if (key === 'autoBackup' && typeof value === 'boolean') {
      out.autoBackup = value ? 'weekly' : 'off';
      continue;
    }
    if (key === 'reminderTime') {
      if (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) out.reminderTime = value;
      continue;
    }
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
  // Dim and warmth were two sliders before night light had steps: the nearest step.
  const old = stored as Record<string, unknown>;
  if (stored.nightLight === undefined && (typeof old.dim === 'number' || typeof old.warmth === 'number')) out.nightLight = nearestNightLight(Number(old.dim) || 0, Number(old.warmth) || 0);
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

/** Night light's steps: how much the page is dimmed (0 … 0.7) and warmed (0 … 1). */
export const NIGHT_LIGHT: Record<NightLight, { dim: number; warmth: number }> = {
  off: { dim: 0, warmth: 0 },
  soft: { dim: 0.08, warmth: 0.25 },
  warm: { dim: 0.12, warmth: 0.55 },
  evening: { dim: 0.28, warmth: 0.75 },
  night: { dim: 0.45, warmth: 1 },
};

/** Days between automatic backups. */
export const BACKUP_DAYS: Record<Exclude<BackupFrequency, 'off'>, number> = { daily: 1, weekly: 7, monthly: 30 };

/** The night-light step closest to a dim and a warmth. */
export function nearestNightLight(dim: number, warmth: number): NightLight {
  if (dim <= 0 && warmth <= 0) return 'off';
  let best: NightLight = 'off';
  let far = Infinity;
  for (const [id, l] of Object.entries(NIGHT_LIGHT) as [NightLight, { dim: number; warmth: number }][]) {
    const d = (l.dim - dim) ** 2 + ((l.warmth - warmth) / 2) ** 2;
    if (d < far) [best, far] = [id, d];
  }
  return best;
}
