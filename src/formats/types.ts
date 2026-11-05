// The shapes every format is read into. EPUB, Word, Markdown, HTML and plain
// text become a "flow" document: sections of sanitised HTML that reflow in
// the reader's own typography. PDF stays as fixed pages.

export type Format = 'epub' | 'pdf' | 'docx' | 'md' | 'txt' | 'html';

export const FORMAT_LABEL: Record<Format, string> = {
  epub: 'EPUB',
  pdf: 'PDF',
  docx: 'Word',
  md: 'Markdown',
  txt: 'Text',
  html: 'HTML',
};

/** What the library keeps about a file before it is opened. */
export interface DocInfo {
  format: Format;
  title: string;
  author: string;
  /** A small JPEG of the cover or first page, when there is one. */
  cover: Uint8Array | null;
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
}

export interface FlowDoc {
  kind: 'flow';
  sections: Section[];
  toc: TocEntry[];
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
  renderPage: (page: number, canvas: HTMLCanvasElement, textLayer: HTMLElement, cssWidth: number) => Promise<void>;
  dispose: () => void;
}

export type OpenDoc = FlowDoc | PdfDoc;

export class FormatError extends Error {}
