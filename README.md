# Rosetta

A quiet library and reader for EPUB, PDF, Word, OpenDocument, RTF, FB2, comic archives, Markdown, HTML and plain-text documents. Add your files, read them in one calm typeface, and come back to the exact place you stopped. It runs in the browser and as an Android and iOS app, and everything stays on your device.

Rosetta uses **Editorial Dusk & Dawn**, the design system it shares with Waymark, BookShelf, Ledger and Colophon. Everything shared (tokens, Fraunces, the shared components and the colour checks) comes from one package, [`dusk-dawn`](https://github.com/not-mehul/dusk-dawn), whose `style.md` is the spec.

## What it does

- **Library.** Documents as cards with their covers, a *Continue reading* panel, shelves for Reading, All and Finished, and **collections** a document can be on any number of. When nothing is in progress, *Up next* offers the next volume of a series just finished, and the end of a book and its details point to it too. Sort by recent, title, author or series; filter by title, author, series or `#tag`. *Edit details* fixes the title, author, series and volume, tags and cover. Add a whole folder at once where the browser allows it. Adding the same file twice keeps one copy.
- **Formats.** EPUB 2 and 3 (contents, images, footnotes, language and reading direction, series from Calibre or EPUB 3 metadata, fixed-layout books page by page), PDF (pdf.js, with a selectable text layer, password prompts and fit-to-page), Word `.docx`, OpenDocument `.odt`, RTF, FictionBook `.fb2`, comic archives `.cbz`, Markdown with front matter, HTML and plain text. Publisher scripts never run; a book's own styles can be kept under the reader's theme (*Book's own styles*). EPUBs with DRM are refused with a plain explanation, since Rosetta can't open them.
- **Reading.** Scroll, or turn pages one screen at a time with a **page curl**, a slide or no motion (reduce-motion always means none). Tap the edges, swipe, use the arrow keys or, on Android, the volume keys. Footnotes open in place; pictures open full screen with pinch zoom. **Read aloud** speaks sentence by sentence with the sentence highlighted. A dim and warmth layer helps at night, and the screen can stay on. The footer's line is cut at each chapter, and a tap on its figure moves between the time left in the book, the time left in the chapter and which chapter this is. After a jump from the contents, search, a link or a note, **Back to** returns to the place you left (and then offers the way forward again). Leaving after a real sitting says how long it was and how far it went.
- **Contents, bookmarks and highlights** in one sheet, with a page grid of thumbnails for PDFs. Highlights come in three colours with an optional note, export as Markdown, and can be shared as a quote card. *All notes* gathers every highlight from every document, searchable. *Look up* sends a selection to the system dictionary.
- **Stats.** Time read today and this week, the streak and the longest one, pace, a **daily goal** (15, 30 or 60 minutes, shown beside *Continue reading* and noted once when it is met), a calendar of the last four months with each day's time, the documents that took the most time, and what was finished this year. A document's details show the time spent in it, and finishing one says how long it took.
- **Catalogs.** Browse and download from OPDS catalogs (Project Gutenberg and Standard Ebooks are built in; add a Calibre server or a library's feed).
- **Your data.** Export every note as Markdown; back up places, marks, details and collections as JSON, or save the whole library with its files as a zip. On a phone, a dated backup is written each week (the last five are kept). **Sync with a folder** merges places and marks with a file in a folder you choose (or `Documents/Rosetta/sync` on a phone, for iCloud Drive, Syncthing or Dropbox), last write wins, deletions included. *Storage* shows what each file takes and can offload a file while keeping its place and notes.
- **Languages.** English, Spanish, French and German, following the system or chosen in Settings.
- **The sibling apps.** A finished book can be logged in BookShelf (`bookshelf://log?…`, the same URL scheme on Android and iOS), and an EPUB can be opened in Colophon through the share sheet. Other apps can open a document with `rosetta://open?id=…` or `rosetta://open?title=…`. The scheme convention is the one all five apps share (`src/platform/links.ts`, style.md §14.1).

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
- **Links.** Both platforms register the `rosetta` URL scheme and are allowed to ask whether each sibling app (`waymark`, `bookshelf`, `ledger`, `colophon`) is installed (`<queries>` on Android, `LSApplicationQueriesSchemes` on iOS).
- **Volume keys** turn pages through a small Android plugin (`VolumeKeysPlugin.java`); iOS has no public API for them.
- **System.** The back button closes the topmost sheet, then the reader, then the app. The system bars follow the theme, and the splash is Dusk's `--bg-grad-mid` behind the amber R.
- Notes and backups are saved to `Documents/Rosetta/` (the app's folder in Files on iOS), or downloaded in a browser.

## Layout

| Path | What it is |
|---|---|
| `src/formats/` | Format detection, sanitising, and the readers for each format, with no UI |
| `src/reader/` | Text offsets and highlight painting, search, progress, selection, pages, the page curl, footnotes and sentences |
| `src/state/` | The library, the open document and its marks, settings, reading stats, read aloud, backup and sync, and UI state |
| `src/components/` | The library, the reader views and the sheets; `ui/` holds Rosetta's own pieces (Sheet, Modal and the rest); TabRail, Toast and ThemeToggle come from `dusk-dawn` |
| `src/platform/` | Native bridges: files in and out, theme and system bars, haptics, keep-awake, volume keys and hand-off to the other apps |
| `src/i18n/` | The interface strings: `en.ts` is the reference, and `es.ts`, `fr.ts` and `de.ts` must have every key (a unit test checks the placeholders) |
| `src/lib/` | Pickers, exports, quote cards, OPDS catalogs and the guide |
| `src/styles/` | `app.css`, which imports `dusk-dawn/tokens.css` and `dusk-dawn/components.css` first |
| `tests/` | Vitest unit tests, Playwright end-to-end tests, and the fixtures (`tests/fixtures/make-fixtures.mjs` rebuilds them) |
| `android/`, `ios/` | The Capacitor projects |

## Design tokens

Tokens, fonts and the shared components live in the [`dusk-dawn`](https://github.com/not-mehul/dusk-dawn) package, installed at a tag. To change the design, change the package, tag a release, and move the tag in `package.json` (`style.md` §18). `dusk-dawn check` (part of `npm run check`) tests contrast in both themes, and `dusk-dawn colours` (part of `npm run lint`) fails on any literal colour in `src/`.

```sh
npm run icons        # regenerate src/components/ui/icons.ts after using a new Lucide name
```

## Updates

Renovate (`renovate.json`) groups dev tooling and the Capacitor plugins. pdf.js is pinned and every bump is reviewed by hand after `npm run test:pdf`, because its worker and assets are copied into the build. CI builds the web app, runs the unit and end-to-end tests, builds Android and iOS, and starts the Android build on an emulator to check it launches and opens a `rosetta://` link.

## Licences

Fraunces: SIL Open Font License (shipped in `dusk-dawn`). Lucide: ISC. pdf.js: Apache 2.0. mammoth: BSD 2-Clause. marked and fflate: MIT. DOMPurify: Apache 2.0 or MPL 2.0. Dexie: Apache 2.0. Capacitor and its plugins: MIT.
