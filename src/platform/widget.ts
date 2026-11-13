// The Continue Reading widget (Android, ContinueReadingWidget.java): the book
// last opened and not yet finished, with its cover and how far in, and a tap
// that opens it at the same place (rosetta://open?id=…). The widget can't read
// the library, so the app sends it the book whenever it changes.

import { registerPlugin } from "@capacitor/core";
import type { StoredDoc } from "../state/db";
import { isReading } from "../state/library.svelte";
import { bytesToBase64 } from "../lib/base64";
import { platform } from "./native";

export interface WidgetBook {
  id: string;
  title: string;
  author: string;
  /** Whole percent read. */
  percent: number;
}

interface WidgetIO {
  update(options: {
    id: string;
    title: string;
    author: string;
    percent: number;
    eyebrow: string;
    progress: string;
    empty: string;
    hasCover: boolean;
    cover?: string;
  }): Promise<void>;
}

const Widget = registerPlugin<WidgetIO>("ReadingWidget");

/** The book to continue: the one opened last, among those started and not finished. */
export function bookToContinue(items: readonly StoredDoc[]): StoredDoc | null {
  return (
    items
      .filter(isReading)
      .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))[0] ?? null
  );
}

let last = "";
let lastCover = "";

/** Sends the widget its book (or nothing to continue), when that has changed. */
export function updateWidget(
  doc: StoredDoc | null,
  words: {
    eyebrow: string;
    progress: (percent: number) => string;
    empty: string;
  },
): void {
  if (platform !== "android") return;
  const percent = doc ? Math.min(99, Math.floor(doc.progress * 100)) : 0;
  const key = doc
    ? `${doc.id}|${doc.title}|${doc.author}|${percent}|${doc.cover?.length ?? 0}|${words.eyebrow}`
    : `none|${words.empty}`;
  if (key === last) return;
  last = key;
  // The cover goes only when the book or its cover changes; the widget keeps the last one it was given.
  const coverKey = doc?.cover ? `${doc.id}|${doc.cover.length}` : "";
  const cover =
    doc?.cover && coverKey !== lastCover ? bytesToBase64(doc.cover) : undefined;
  lastCover = coverKey;
  void Widget.update({
    id: doc?.id ?? "",
    title: doc?.title ?? "",
    author: doc?.author ?? "",
    percent,
    eyebrow: words.eyebrow,
    progress: words.progress(percent),
    empty: words.empty,
    hasCover: Boolean(doc?.cover),
    ...(cover ? { cover } : {}),
  }).catch((err: unknown) => console.warn("Widget update failed", err));
}
