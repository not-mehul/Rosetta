# Rosetta

A quiet library and reader for EPUB, PDF, Word, OpenDocument, RTF, FB2, comic archives, Markdown, HTML and plain-text documents. Add your files, read them in one calm typeface, and come back to the exact place you stopped. It runs in the browser and as an Android and iOS app, and everything stays on your device.

Rosetta uses **Editorial Dusk & Dawn**, the design system it shares with Waymark, BookShelf, Ledger and Colophon. The spec is [`design/style.md`](design/style.md).

## What it does

- **Library.** Documents as cards with their covers, a *Continue reading* panel, shelves for Reading, All and Finished, and **collections** a document can be on any number of. Sort by recent, title, author or series; filter by title, author, series or `#tag`. *Edit details* fixes the title, author, series and volume, tags and cover. Add a whole folder at once where the browser allows it. Adding the same file twice keeps one copy.
- **Formats.** EPUB 2 and 3 (contents, images, footnotes, language and reading direction, series from Calibre or EPUB 3 metadata, fixed-layout books page by page), PDF (pdf.js, with a selectable text layer, password prompts and fit-to-page), Word `.docx`, OpenDocument `.odt`, RTF, FictionBook `.fb2`, comic archives `.cbz`, Markdown with front matter, HTML and plain text. Publisher scripts never run; a book's own styles can be kept under the reader's theme (*Book's own styles*). EPUBs with DRM are refused with a plain explanation, since Rosetta can't open them.
- **Reading.** Scroll, or turn pages one screen at a time with a **page curl**, a slide or no motion (reduce-motion always means none). Tap the edges, swipe, use the arrow keys or, on Android, the volume keys. Footnotes open in place; pictures open full screen with pinch zoom. **Read aloud** speaks sentence by sentence with the sentence highlighted. A dim and warmth layer helps at night, and the screen can stay on. The footer shows the place, the share read and the time left at your own pace.
- **Contents, bookmarks and highlights** in one sheet, with a page grid of thumbnails for PDFs. Highlights come in three colours with an optional note, export as Markdown, and can be shared as a quote card. *All notes* gathers every highlight from every document, searchable. *Look up* sends a selection to the system dictionary.
- **Stats.** Time read today and this week, the streak, pace, and what was finished this year.
- **Catalogs.** Browse and download from OPDS catalogs (Project Gutenberg and Standard Ebooks are built in; add a Calibre server or a library's feed).
- **Your data.** Export every note as Markdown; back up places, marks, details and collections as JSON, or save the whole library with its files as a zip. On a phone, a dated backup is written each week (the last five are kept). **Sync with a folder** merges places and marks with a file in a folder you choose (or `Documents/Rosetta/sync` on a phone, for iCloud Drive, Syncthing or Dropbox), last write wins, deletions included. *Storage* shows what each file takes and can offload a file while keeping its place and notes.
- **Languages.** English, Spanish, French and German, following the system or chosen in Settings.
- **The sibling apps.** A finished book can be logged in BookShelf (`bookshelf://log?…`, the same URL scheme on Android and iOS), and an EPUB can be opened in Colophon through the share sheet. Other apps can open a document with `rosetta://open?id=…` or `rosetta://open?title=…`.

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run check        # tokens, lint, literal colours, typecheck, unit tests
npm run test:e2e     # builds, then Playwright at phone size (with axe accessibility checks and a performance budget)
npm run test:pdf     # the PDF tests alone, for pdf.js upgrades
```

Svelte 5, TypeScript and Vite. The library lives in IndexedDB (Dexie). pdf.js and mammoth load only when a PDF or a Word file is opened, and each language other than English only when it is chosen. pdf.js's CMaps, standard fonts and decoders are copied into `public/pdfjs/` at build time, so PDFs open offline.

## The apps

Capacitor 8 wraps the same build for Android and iOS.

```sh
npm run android      # build, sync and open Android Studio
npm run android:apk  # a debug APK
npm run ios          # build, sync and open Xcode
npm run assets       # redraw the app icon and splash screens
```

- **Open with.** Android registers VIEW intents for EPUB, PDF, Word, OpenDocument, RTF, FB2, CBZ, Markdown, text and HTML; iOS declares the matching document types. Both arrive through `appUrlOpen` (`src/platform/intake.ts`), and the format is read from the bytes, since Android content URIs rarely carry a file name.
- **Links.** Both platforms register the `rosetta` URL scheme and are allowed to ask whether `bookshelf` is installed (`<queries>` on Android, `LSApplicationQueriesSchemes` on iOS).
- **Volume keys** turn pages through a small Android plugin (`VolumeKeysPlugin.java`); iOS has no public API for them.
- **System.** The back button closes the topmost sheet, then the reader, then the app. The system bars follow the theme, and the splash is Dusk's `--bg-grad-mid` behind the amber R.
- Notes and backups are saved to `Documents/Rosetta/` (the app's folder in Files on iOS), or downloaded in a browser.

## Layout

| Path | What it is |
|---|---|
| `src/formats/` | Format detection, sanitising, and the readers for each format, with no UI |
| `src/reader/` | Text offsets and highlight painting, search, progress, selection, pages, the page curl, footnotes and sentences |
| `src/state/` | The library, the open document and its marks, settings, reading stats, read aloud, backup and sync, and UI state |
| `src/components/` | The library, the reader views and the sheets; `ui/` holds the shared pieces (TabRail, Toast, ThemeToggle, Sheet and Modal are the same as in the other apps) |
| `src/platform/` | Native bridges: files in and out, theme and system bars, haptics, keep-awake, volume keys and hand-off to the other apps |
| `src/i18n/` | The interface strings: `en.ts` is the reference, and `es.ts`, `fr.ts` and `de.ts` must have every key (a unit test checks the placeholders) |
| `src/lib/` | Pickers, exports, quote cards, OPDS catalogs and the guide |
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

## Updates

Renovate (`renovate.json`) groups dev tooling and the Capacitor plugins. pdf.js is pinned and every bump is reviewed by hand after `npm run test:pdf`, because its worker and assets are copied into the build. CI builds the web app, runs the unit and end-to-end tests, builds Android and iOS, and starts the Android build on an emulator to check it launches and opens a `rosetta://` link.

## Licences

Fraunces: SIL Open Font License (`design/fonts/Fraunces-OFL.txt`). Lucide: ISC. pdf.js: Apache 2.0. mammoth: BSD 2-Clause. marked and fflate: MIT. DOMPurify: Apache 2.0 or MPL 2.0. Dexie: Apache 2.0. Capacitor and its plugins: MIT.
