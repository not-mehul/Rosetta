# Developing Rosetta

How Rosetta is built, run and tested. For what the app does, see the [README](../README.md); for cutting a release, see [RELEASING.md](../RELEASING.md).

## Run it

```sh
npm install
npm run dev          # http://localhost:5173
npm run check        # tokens, lint, literal colours, typecheck, unit tests
npm run test:e2e     # builds, then Playwright at phone size (with axe accessibility checks and a performance budget)
npm run test:pdf     # the PDF tests alone, for pdf.js upgrades
SCREENS=/tmp/screens npx playwright test screens   # a screenshot tour of every screen, in Dusk and Dawn
```

Svelte 5, TypeScript and Vite. The library lives in IndexedDB (Dexie). The first download is the library alone: the reader, the sheets, Notes and Stats are separate parts (`src/components/parts.ts`, shown through `Lazy.svelte`) fetched while the phone is idle, each format's reader loads when a file of its kind is added or opened, pdf.js and mammoth with it, and each language other than English only when it is chosen. pdf.js's CMaps, standard fonts and decoders are copied into `public/pdfjs/` at build time, so PDFs open offline.

## Android and iOS

Capacitor 8 wraps the same build for Android and iOS.

```sh
npm run android      # build, sync and open Android Studio
npm run android:apk  # a debug APK
npm run ios          # build, sync and open Xcode
npm run assets       # redraw the app icon and splash screens
```

- **Open with.** Android registers VIEW intents for EPUB, PDF, Word, OpenDocument, RTF, FB2, CBZ, Markdown, text and HTML; iOS declares the matching document types. Both arrive through `appUrlOpen` (`src/platform/intake.ts`), and the format is read from the bytes, since Android content URIs rarely carry a file name.
- **Links.** Both platforms register the `rosetta` URL scheme and are allowed to ask whether each sibling app (`waymark`, `bookshelf`, `ledger`, `mise`) is installed (`<queries>` on Android, `LSApplicationQueriesSchemes` on iOS).
- **Volume keys** turn pages through a small Android plugin (`VolumeKeysPlugin.java`); iOS has no public API for them.
- **System.** The back button closes the topmost sheet, then the reader, then the app. The system bars follow the theme, and the splash is Dusk's `--bg-grad-mid` behind the amber R.
- **Haptics.** A light tick on a choice, a success buzz on a goal, a streak or a finished book (`src/platform/device.ts`), when the Haptics setting is on.
- Notes and backups are saved to `Documents/Rosetta/` (the app's folder in Files on iOS), or downloaded in a browser. The sync file and the automatic backups go to a folder chosen with the system picker (`src/platform/folders.ts`, `FolderPlugin.java`, `FoldersPlugin.swift`), falling back to `Documents/Rosetta/` until one is chosen.

## Layout

| Path | What it is |
|---|---|
| `src/formats/` | Format detection, sanitising, and the readers for each format, with no UI |
| `src/reader/` | Text offsets and highlight painting, search, progress, selection, pages, the page curl, footnotes and sentences |
| `src/state/` | The library, the open document and its marks (`marks.ts` writes them, with the tombstones sync needs), choosing several books, settings, reading stats, read aloud, backup and sync, and UI state |
| `src/components/` | The library, the reader views and the sheets; `ui/` holds Rosetta's own pieces (Sheet, Modal, the hold menu and the rest); IconTabs, Select, Switch, TimeField and WavyProgress come from `dusk-dawn` |
| `src/platform/` | Native bridges: files in and out, theme and system bars, haptics, keep-awake, volume keys and hand-off to the other apps |
| `src/i18n/` | The interface strings: `en.ts` is the reference, and `es.ts`, `fr.ts`, `de.ts` and `ru.ts` must have every key (a unit test checks the placeholders and Russian's plural forms) |
| `src/lib/` | Pickers, exports, quote cards, reminders and the guide; and the interaction helpers: `hold.ts` (long press), `fit.ts` (large text), `feel.ts` (haptics on choices), `iconMotion.ts` and `reveal.ts` (the theme change) |
| `src/styles/` | `app.css`, which imports `dusk-dawn/tokens.css` and `dusk-dawn/components.css` first, and `motion.css`: each icon's motion when tapped, and the app's other moments (tabs sliding, a highlight sweeping in, a new book popping on), all off under reduced motion |
| `tests/` | Vitest unit tests, Playwright end-to-end tests, and the fixtures (`tests/fixtures/make-fixtures.mjs` rebuilds them) |
| `android/`, `ios/` | The Capacitor projects |

## Design tokens

Tokens, fonts and the shared components live in the [`dusk-dawn`](https://github.com/not-mehul/dusk-dawn) package, installed at a tag. To change the design, change the package, tag a release, and move the tag in `package.json` (`style.md` §18). `dusk-dawn check` (part of `npm run check`) tests contrast in both themes, and `dusk-dawn colours` (part of `npm run lint`) fails on any literal colour in `src/`.

```sh
npm run icons        # regenerate src/components/ui/icons.ts after using a new Lucide name
```

## Updates

Dependencies are updated by hand. pdf.js is pinned and every bump is reviewed by hand after `npm run test:pdf`, because its worker and assets are copied into the build. CI runs one quick job on every pull request and push to main: `npm run check` (tokens, lint, colours, typecheck, unit tests), then the web build and the Playwright end-to-end tests against it. The slow checks (the Android debug and release builds with an emulator launch test, and the iOS simulator build) run when started by hand from the Actions tab with *Run workflow*.
