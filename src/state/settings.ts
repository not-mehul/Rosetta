// Settings and reading preferences, with their allowed values.

export type ThemeSetting = 'system' | 'dark' | 'light';
export type Typeface = 'serif' | 'sans';
export type Spacing = 'compact' | 'normal' | 'loose';
export type Measure = 'narrow' | 'medium' | 'wide';
export type PageTone = 'original' | 'theme';
export type LibrarySort = 'recent' | 'title' | 'author';
export type LibraryShelf = 'reading' | 'all' | 'finished';
export type PdfZoom = 1 | 1.25 | 1.5 | 2;

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
  /** PDF page width, as a multiple of the column. */
  pdfZoom: PdfZoom;
  sort: LibrarySort;
  shelf: LibraryShelf;
  /** The document open when the app last closed. */
  lastDocId: string | null;
}

export const FONT_SIZES = { min: 14, max: 28, step: 1 } as const;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  typeface: 'serif',
  fontSize: 18,
  spacing: 'normal',
  measure: 'medium',
  justify: false,
  pageTone: 'original',
  pdfZoom: 1,
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
  pdfZoom: [1, 1.25, 1.5, 2],
  sort: ['recent', 'title', 'author'],
  shelf: ['reading', 'all', 'finished'],
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
    } else if (key === 'fontSize') {
      if (typeof value === 'number' && value >= FONT_SIZES.min && value <= FONT_SIZES.max) out.fontSize = Math.round(value);
    } else if (key === 'lastDocId') {
      if (value === null || typeof value === 'string') out.lastDocId = value;
    } else if (typeof value === typeof DEFAULT_SETTINGS[key]) {
      writable[key] = value;
    }
  }
  return out;
}

/** CSS values for the reading column. */
export const SPACING_VALUE: Record<Spacing, number> = { compact: 1.45, normal: 1.65, loose: 1.9 };
export const MEASURE_VALUE: Record<Measure, string> = { narrow: '32em', medium: '38em', wide: '46em' };
