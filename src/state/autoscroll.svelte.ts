// Auto-scroll: in scroll mode, the page moves up at a steady pace set in
// lines a minute, for reading hands-free without the voice. A tap on the page
// pauses it, and another goes on; scrolling by hand pauses it too. It stops at
// the end of the chapter, where the next one waits to be chosen.

import { settings } from './settings.svelte';

export const AUTO_SCROLL = { min: 4, max: 60, step: 2 } as const;

class AutoScroll {
  /** Started: running or paused. */
  active = $state(false);
  running = $state(false);
  private frame = 0;
  private last = 0;
  /** Sub-pixel travel carried between frames, which scrollBy would round away. */
  private carry = 0;
  /** One line of the reading text, in pixels (ReaderView sets it). */
  lineHeight = 28;

  get speed(): number {
    return settings.value.autoScrollSpeed;
  }

  start(): void {
    this.active = true;
    this.resume();
  }

  resume(): void {
    if (!this.active || this.running) return;
    this.running = true;
    this.last = performance.now();
    this.carry = 0;
    const step = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(100, now - this.last);
      this.last = now;
      this.carry += ((this.speed * this.lineHeight) / 60_000) * dt;
      const px = Math.floor(this.carry);
      if (px > 0) {
        this.carry -= px;
        const before = scrollY;
        scrollBy(0, px);
        // The bottom of the chapter: nothing more to scroll.
        if (scrollY === before && scrollY + innerHeight >= document.documentElement.scrollHeight - 2) {
          this.pause();
          return;
        }
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
  }

  toggle(): void {
    if (this.running) this.pause();
    else this.resume();
  }

  stop(): void {
    this.pause();
    this.active = false;
  }

  async setSpeed(lines: number): Promise<void> {
    await settings.update({ autoScrollSpeed: Math.max(AUTO_SCROLL.min, Math.min(AUTO_SCROLL.max, Math.round(lines))) });
  }
}

export const autoScroll = new AutoScroll();
