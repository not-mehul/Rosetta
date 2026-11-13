// Read aloud: speaks the open document a sentence at a time from the reader's
// place, so the sentence being read is highlighted and followed on the page.
// Uses the system's text-to-speech (the plugin falls back to the browser's
// speechSynthesis on the web). On Android it carries on with the screen off,
// with lock-screen and headphone controls (src/platform/read-aloud.ts), and a
// sleep timer stops it after a while or at the end of the chapter.

import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { sentences, type Sentence } from '../reader/sentences';
import { reader } from './reader.svelte';
import { settings } from './settings.svelte';
import { ui } from './ui.svelte';
import { t } from '../i18n/index.svelte';
import { hideReadAloud, onReadAloudAction, showReadAloud } from '../platform/read-aloud';

/** Sleep timer choices: minutes, or the end of the chapter being read. */
export type SleepChoice = 15 | 30 | 45 | 60 | 'chapter';
export const SLEEP_CHOICES: (SleepChoice | null)[] = [null, 15, 30, 45, 60, 'chapter'];

export interface Spoken extends Sentence {
  section: number;
}

class SpeechState {
  /** The bar is showing. */
  active = $state(false);
  playing = $state(false);
  /** The sentence being read, for the highlight. */
  current = $state.raw<Spoken | null>(null);
  voices = $state.raw<{ index: number; name: string; lang: string }[]>([]);

  /** The sleep timer: when to stop (ms since the epoch), or at the chapter's end. */
  sleep = $state<{ choice: SleepChoice; at: number | null } | null>(null);

  private queue: Spoken[] = [];
  private run = 0;
  private sleepTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    onReadAloudAction((action) => {
      if (action === 'play') void this.play();
      else if (action === 'pause') this.pause();
      else if (action === 'next') void this.skip(1);
      else if (action === 'previous') void this.skip(-1);
      else this.stop();
    });
  }

  /** Sets (or with null, clears) the sleep timer. */
  setSleep(choice: SleepChoice | null, now = Date.now()): void {
    clearTimeout(this.sleepTimer);
    if (choice === null) {
      this.sleep = null;
      return;
    }
    const at = choice === 'chapter' ? null : now + choice * 60_000;
    this.sleep = { choice, at };
    // A timer for when the page is awake; the sentence loop also checks, for when it isn't.
    if (at !== null) this.sleepTimer = setTimeout(() => this.sleepNow(), at - now);
  }

  /** The next sleep choice after the current one, for the timer button. */
  nextSleep(): SleepChoice | null {
    const i = SLEEP_CHOICES.indexOf(this.sleep?.choice ?? null);
    return SLEEP_CHOICES[(i + 1) % SLEEP_CHOICES.length] ?? null;
  }

  private sleepDue(now = Date.now()): boolean {
    return this.sleep?.at != null && now >= this.sleep.at;
  }

  private sleepNow(): void {
    this.sleep = null;
    clearTimeout(this.sleepTimer);
    if (!this.playing) return;
    this.pause();
    ui.notify(t('speech.slept'), 'info');
  }

  /** What the lock screen shows: the document, and the chapter being read. */
  private controls(): { title: string; subtitle: string } {
    const section = this.current?.section ?? reader.location.section;
    return { title: reader.doc?.title ?? '', subtitle: reader.whereIs(section) };
  }

  get available(): boolean {
    return typeof window !== 'undefined';
  }

  private voicesAsked = false;

  /** Asks the system for its voices once. */
  async loadVoices(): Promise<void> {
    if (this.voicesAsked) return;
    this.voicesAsked = true;
    try {
      const { voices } = await TextToSpeech.getSupportedVoices();
      this.voices = voices.map((v, index) => ({
        index,
        name: v.name,
        lang: v.lang,
      }));
    } catch {
      this.voices = [];
    }
  }

  /** Starts reading from the reader's place. */
  async start(): Promise<void> {
    if (!reader.content) return;
    this.active = true;
    await this.fill(reader.location.section, reader.isPdf ? 0 : reader.location.offset);
    void this.play();
  }

  private async fill(section: number, from: number): Promise<void> {
    const c = reader.content;
    if (!c) return;
    const text = c.kind === 'flow' ? (c.sections[section]?.text ?? '') : await c.pageText(section);
    this.queue = sentences(text, from, c.kind === 'flow' ? c.lang : undefined).map((s) => ({ ...s, section }));
  }

  async play(): Promise<void> {
    if (!this.active) return;
    const run = ++this.run;
    this.playing = true;
    showReadAloud({ ...this.controls(), playing: true });
    while (this.playing && run === this.run) {
      if (this.sleepDue()) {
        this.sleepNow();
        return;
      }
      let next = this.queue.shift();
      if (!next) {
        if (this.sleep?.choice === 'chapter') {
          this.sleepNow();
          return;
        }
        const at = (this.current?.section ?? reader.location.section) + 1;
        if (at >= reader.sectionCount) {
          this.stop();
          ui.notify(t('error.speechDone'), 'info');
          return;
        }
        await this.fill(at, 0);
        if (reader.content?.kind === 'flow') reader.goTo({ section: at, offset: 0 });
        next = this.queue.shift();
        if (!next) continue;
        showReadAloud({ ...this.controls(), playing: true });
      }
      this.current = next;
      try {
        const voice = this.voices.find((v) => v.name === settings.value.voice);
        await TextToSpeech.speak({
          text: next.text,
          lang: (reader.content?.kind === 'flow' ? reader.content.lang : undefined) || navigator.language || 'en-GB',
          rate: settings.value.speechRate,
          voice: voice?.index,
          category: 'playback',
        });
      } catch (err) {
        if (run !== this.run) return;
        this.playing = false;
        ui.notify(`Reading aloud stopped: ${err instanceof Error ? err.message : String(err)}`, 'error');
        return;
      }
    }
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.run++;
    // Start again from the sentence that was cut off.
    if (this.current) this.queue.unshift(this.current);
    void TextToSpeech.stop().catch(() => undefined);
    if (this.active) showReadAloud({ ...this.controls(), playing: false });
  }

  /** Skips forward or back a sentence. */
  async skip(by: 1 | -1): Promise<void> {
    const at = this.current;
    if (!at) return;
    this.pause();
    if (by === 1) this.queue.shift();
    else {
      await this.fill(at.section, 0);
      const i = this.queue.findIndex((s) => s.start >= at.start);
      this.queue = this.queue.slice(Math.max(0, i - 1));
    }
    void this.play();
  }

  /** A new speed takes effect from the next sentence. */
  async setRate(rate: number): Promise<void> {
    await settings.update({
      speechRate: Math.round(Math.max(0.5, Math.min(2, rate)) * 100) / 100,
    });
    if (this.playing) {
      this.pause();
      void this.play();
    }
  }

  stop(): void {
    this.run++;
    this.playing = false;
    this.active = false;
    this.current = null;
    this.queue = [];
    this.setSleep(null);
    void TextToSpeech.stop().catch(() => undefined);
    hideReadAloud();
  }
}

export const speech = new SpeechState();
