# Rosetta

A quiet library and reader for EPUB, PDF, Word, Markdown, HTML and plain-text documents. Add your files, read them in one calm typeface, and come back to the exact place you stopped. It runs in the browser and as an Android and iOS app, and everything stays on your device.

Rosetta uses **Editorial Dusk & Dawn**, the design system it shares with Waymark, BookShelf, Ledger and Colophon. The spec is [`design/style.md`](design/style.md).

## What it does

- **Library.** Documents as cards with their covers (the EPUB cover or the first PDF page), a *Continue reading* panel, shelves for Reading, All and Finished, sorting by recent, title or author, and a filter. Adding the same file twice keeps one copy. Details show the format, size and progress, and offer *Mark finished*, *Start over*, *Export notes*, *Share file* and *Remove* (with undo).
- **Formats.** EPUB 2 and 3 (spine, nav or NCX contents, images, cross-chapter links), PDF (pdf.js, with a selectable text layer), Word `.docx` (mammoth), Markdown with front matter, HTML and plain text. Everything but PDF reflows in the reader's own type; publisher scripts, styles and classes are dropped.
- **Reading.** Tap the page to hide the bars, or just scroll on. The footer shows the place, the share read and the time left. The place is a character offset, so it survives any change of size or typeface, and the reader reopens the last document where it was.
- **Contents, bookmarks and highlights** in one sheet. Highlights come in three colours with an optional note, and export as Markdown.
- **Search** across the whole document, with the match flashed where it lands.
- **Type and theme.** Serif (Fraunces) or sans, size, line spacing, column width and justification; for PDFs, zoom and *Dusk pages* (inverted to light on dark). System, Dusk or Dawn.
- **Your data.** Export every note as Markdown, and back up or restore places, bookmarks and highlights as JSON. Backups hold no files; they rejoin documents by their SHA-256 fingerprint.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run check        # tokens, lint, literal colours, typecheck, unit tests
npm run test:e2e     # builds, then Playwright at phone size
```

Svelte 5, TypeScript and Vite. The library lives in IndexedDB (Dexie). pdf.js and mammoth load only when a PDF or a Word file is opened. pdf.js's CMaps, standard fonts and decoders are copied into `public/pdfjs/` at build time, so PDFs open offline.

## The apps

Capacitor 8 wraps the same build for Android and iOS.

```sh
npm run android      # build, sync and open Android Studio
npm run android:apk  # a debug APK
npm run ios          # build, sync and open Xcode
npm run assets       # redraw the app icon and splash screens
```

- **Open with.** Android registers VIEW intents for EPUB, PDF, Word, Markdown, text and HTML; iOS declares the matching document types. Both arrive through `appUrlOpen` (`src/platform/intake.ts`), and the format is read from the bytes, since Android content URIs rarely carry a file name.
- **System.** The back button closes the topmost sheet, then the reader, then the app. The system bars follow the theme, and the splash is Dusk's `--bg-grad-mid` behind the amber R.
- Notes and backups are saved to `Documents/Rosetta/` (the app's folder in Files on iOS), or downloaded in a browser.

## Layout

| Path | What it is |
|---|---|
| `src/formats/` | Format detection, sanitising, and the readers for each format, with no UI |
| `src/reader/` | Text offsets and highlight painting, search, progress and selection |
| `src/state/` | The library, the open document and its marks, settings and UI state |
| `src/components/` | The library, the reader views and the sheets; `ui/` holds the shared pieces (TabRail, Toast, ThemeToggle, Sheet and Modal are the same as in the other apps) |
| `src/platform/` | Native bridges: files in and out, theme and system bars |
| `src/styles/` | `tokens.css` (generated), `components.css` (shared, identical to the other apps) and `app.css` |
| `tests/` | Vitest unit tests, Playwright end-to-end tests, and the fixtures (`tests/fixtures/make-fixtures.mjs` rebuilds them) |
| `android/`, `ios/` | The Capacitor projects |
| `design/` | `style.md`, `tokens.json`, `build-tokens.mjs` and the Fraunces fonts, identical to the other apps |

## Design tokens

Edit `design/tokens.json`, never `tokens.css`:

```sh
npm run tokens       # regenerate src/styles/tokens.css and copy the fonts
npm run icons        # regenerate src/components/ui/icons.ts after using a new Lucide name
```

`scripts/check-colours.mjs` (part of `npm run lint`) fails on any literal colour in `src/`.

## Licences

Fraunces: SIL Open Font License (`design/fonts/Fraunces-OFL.txt`). Lucide: ISC. pdf.js: Apache 2.0. mammoth: BSD 2-Clause. marked and fflate: MIT. DOMPurify: Apache 2.0 or MPL 2.0. Dexie: Apache 2.0.
