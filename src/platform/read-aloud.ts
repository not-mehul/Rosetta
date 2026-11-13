// Reading aloud with the screen off (Android): ReadAloudService keeps the app
// running while it reads and puts play, pause and skip on the lock screen,
// in the notification and on headphone buttons. The page still does the
// reading (src/state/speech.svelte.ts); this shows what is being read and
// hears the buttons back. Elsewhere it does nothing.

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { platform } from "./native";

export type ReadAloudAction = "play" | "pause" | "next" | "previous" | "stop";

interface ReadAloudIO {
  update(options: {
    title?: string;
    subtitle?: string;
    playing: boolean;
  }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: "action",
    listener: (e: { action: ReadAloudAction }) => void,
  ): Promise<PluginListenerHandle>;
}

const ReadAloud = registerPlugin<ReadAloudIO>("ReadAloud");
const supported = platform === "android";

let listening: Promise<PluginListenerHandle> | null = null;

/** Listens for the lock-screen and headphone buttons (once). */
export function onReadAloudAction(
  handle: (action: ReadAloudAction) => void,
): void {
  if (!supported || listening) return;
  listening = ReadAloud.addListener("action", (e) => handle(e.action));
}

/** Shows or updates the controls. */
export function showReadAloud(options: {
  title?: string;
  subtitle?: string;
  playing: boolean;
}): void {
  if (!supported) return;
  void ReadAloud.update(options).catch((err: unknown) =>
    console.warn("Read-aloud controls", err),
  );
}

export function hideReadAloud(): void {
  if (!supported) return;
  void ReadAloud.stop().catch(() => undefined);
}
