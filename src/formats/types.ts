import { t } from '../i18n/index.svelte';

// The shapes every format is read into. EPUB, Word, Markdown, HTML and plain
// text become a "flow" document: sections of sanitised HTML that reflow in
// the reader's own typography. PDF stays as fixed pages.

export type Format = 'epub' | 'pdf' | 'docx' | 'md' | 'txt' | 'html' | 'fb2' | 'cbz' | 'rtf' | 'odt' | 'mobi';

export const FORMAT_LABEL: Record<Format, string> = {
  epub: 'EPUB',
  pdf: 'PDF',
  docx: 'Word',
  md: 'Markdown',
  txt: 'Text',
  html: 'HTML',
  fb2: 'FB2',
  cbz: 'Comic',
  rtf: 'RTF',
  odt: 'OpenDocument',
  mobi: 'Kindle',
};

/** What the library keeps about a file before it is opened. */
export interface DocInfo {
  format: Format;
  title: string;
  author: string;
  /** A small JPEG of the cover or first page, when there is one. */
  cover: Uint8Array | null;
  series?: string;
  seriesIndex?: number | null;
}

/** One entry in the table of contents. */
export interface TocEntry {
  label: string;
  /** Section (or PDF page) index. */
  section: number;
  /** An element id inside the section, already prefixed (see sanitize.ts). */
  anchor?: string;
  depth: number;
}

export interface Section {
  title: string;
  /** Sanitised HTML for the section's body. */
  html: string;
  /** The section's text exactly as the rendered DOM's textContent: offsets index into it. */
  text: string;
  /** The EPUB path the section came from, for resolving links. */
  path?: string;
  /** Offsets in the text where a space is drawn but isn't in the text (a PDF's line ends): read aloud and Flow put them in. */
  joins?: number[];
}

/** A fixed-layout page (pre-paginated EPUB): the book's own HTML and CSS at its own size. */
export interface FixedPage {
  width: number;
  height: number;
  /** Sanitised HTML with the book's scoped CSS, for a shadow root. */
  html: string;
  css: string;
}

export interface FlowDoc {
  kind: 'flow';
  sections: Section[];
  toc: TocEntry[];
  /** BCP 47 language of the text, when the file says. */
  lang?: string;
  /** Right-to-left books turn pages the other way. */
  dir?: 'ltr' | 'rtl';
  /** The book's own CSS, scoped to the page (see styles.ts), for "publisher styles". */
  css?: string;
  /** A comic or picture book: every section is one image, shown a page at a time. */
  pictures?: boolean;
  /** Fixed-layout EPUB: one page per section, shown as the publisher laid it out. */
  fixed?: FixedPage[];
  /** A PDF's words as text, a section a page (formats/pdftext.ts): places and marks are the PDF's. */
  fromPdf?: boolean;
  /** Releases object URLs made for images. */
  dispose: () => void;
}

/** The subset of pdf.js the reader uses, kept loose so the library stays lazy-loaded. */
export interface PdfDoc {
  kind: 'pdf';
  pageCount: number;
  toc: TocEntry[];
  /** Page sizes at scale 1, in CSS pixels. */
  sizes: { width: number; height: number }[];
  /** Concatenated text items per page, filled as pages are read. */
  pageText: (page: number) => Promise<string>;
  /** A page's text items with where they sit, for the text view (formats/pdftext.ts). */
  pageItems: (page: number) => Promise<import('./pdftext').PdfItem[]>;
  renderPage: (page: number, canvas: HTMLCanvasElement, textLayer: HTMLElement, cssWidth: number) => Promise<void>;
  /** A small picture of a page, for the page grid. */
  renderThumb: (page: number, canvas: HTMLCanvasElement, cssWidth: number) => Promise<void>;
  dispose: () => void;
}

export type OpenDoc = FlowDoc | PdfDoc;

export class FormatError extends Error {}

/** A PDF that needs its password; `retry` is true when the one given was wrong. */
export class PasswordError extends FormatError {
  constructor(public retry: boolean) {
    super(retry ? t('password.wrong') : t('error.pdfLocked'));
  }
}
