// Read aloud: speaks the open document a sentence at a time from the reader's
// place, so the sentence being read is highlighted and followed on the page.
// Uses the system's text-to-speech (the plugin falls back to the browser's
// speechSynthesis on the web).

import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { sentences, type Sentence } from '../reader/sentences';
import { reader } from './reader.svelte';
import { settings } from './settings.svelte';
import { ui } from './ui.svelte';
import { t } from '../i18n/index.svelte';

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

  private queue: Spoken[] = [];
  private run = 0;

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
    while (this.playing && run === this.run) {
      let next = this.queue.shift();
      if (!next) {
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
    void TextToSpeech.stop().catch(() => undefined);
  }
}

export const speech = new SpeechState();
