// The page-curl turn. A copy of the page being turned sits on top of the
// pager; the fold clips it, the flap shows the plain back of the paper, and
// gradients placed on the fold
// line give the bend its light and its shadow on the page beneath. Every
// colour comes from the theme tokens.
//
// Copying a page means laying out the whole section again, which is far too
// slow to do as a turn starts. So a Curl is made ahead of time, hidden, and
// reused: begin() shows it over any page of the same layout and end() hides it
// again. Each frame then only moves clip paths and gradients; nothing is laid
// out and nothing is filtered. (The print showing through the back of the
// paper, a second mirrored copy, cost more frames on a phone than it was worth.)

import { constrain, fold, gradientLine, polygon, type Pt } from './curl-geometry';

const shadow = (a: number) => `rgba(var(--shadow-rgb), calc(${a.toFixed(3)} * var(--shadow-strength)))`;
const cream = (a: number) => `rgba(var(--cream-rgb), ${a.toFixed(3)})`;

export class Curl {
  private layer: HTMLDivElement;
  private page: HTMLDivElement;
  private bend: HTMLDivElement;
  private shade: HTMLDivElement;
  private flapShadow: HTMLDivElement;
  private flap: HTMLDivElement;
  private cornerY = 0;
  private f: Pt = { x: 0, y: 0 };
  private frame = 0;

  private copy: HTMLElement;

  constructor(
    private host: HTMLElement,
    snapshot: HTMLElement,
  ) {
    const el = (cls: string, parent: HTMLElement) => {
      const d = document.createElement('div');
      d.className = cls;
      parent.appendChild(d);
      return d;
    };
    this.layer = el('curl', host);
    this.layer.setAttribute('aria-hidden', 'true');
    this.layer.classList.add('is-idle');
    this.page = el('curl-page', this.layer);
    this.page.appendChild(snapshot);
    this.bend = el('curl-bend', this.layer);
    this.shade = el('curl-shade', this.layer);
    this.flapShadow = el('curl-flap-shadow', this.layer);
    this.flap = el('curl-flap', this.flapShadow);
    this.copy = snapshot;
  }

  /** Shows the curl over the page whose copy sits at `offsetX`, held by its top or bottom corner. */
  begin(offsetX: number, corner: 'top' | 'bottom'): this {
    cancelAnimationFrame(this.frame);
    this.copy.style.transform = `translateX(${offsetX}px)`;
    this.cornerY = corner === 'top' ? 0 : this.host.clientHeight;
    this.f = { x: this.host.clientWidth, y: this.cornerY };
    this.layer.classList.remove('is-idle');
    return this;
  }

  /** Hides the curl, ready for the next turn. */
  end(): void {
    cancelAnimationFrame(this.frame);
    this.layer.classList.add('is-idle');
  }

  get width(): number {
    return this.host.clientWidth;
  }

  get height(): number {
    return this.host.clientHeight;
  }

  get corner(): number {
    return this.cornerY;
  }

  get finger(): Pt {
    return this.f;
  }

  /** Lifts the corner to `to` (page coordinates). */
  set(to: Pt): void {
    const w = this.width;
    const h = this.height;
    this.f = constrain(to, w, h, this.cornerY);
    const g = fold(w, h, this.cornerY, this.f);
    const line = gradientLine(w, h, g.normal);
    const back = gradientLine(w, h, { x: -g.normal.x, y: -g.normal.y });
    const at = line.at(g.mid);
    const atBack = back.at(g.mid);
    // Shadows are strongest mid-turn and fade as the page lies down on either side.
    const depth = 0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, g.turned * 1.15));
    const reach = Math.max(24, Math.min(160, Math.hypot(w - this.f.x, this.cornerY - this.f.y) * 0.35));

    this.page.style.clipPath = polygon(g.kept);
    this.bend.style.clipPath = polygon(g.kept);
    this.bend.style.background = `linear-gradient(${line.angle}deg, transparent ${at - reach}px, ${shadow(0.1 * depth)} ${at - 6}px, ${shadow(0.22 * depth)} ${at}px)`;
    this.shade.style.clipPath = polygon(g.removed);
    this.shade.style.background = `linear-gradient(${line.angle}deg, ${shadow(0.5 * depth)} ${at}px, ${shadow(0.18 * depth)} ${at + reach * 0.4}px, transparent ${at + reach}px)`;
    this.flap.style.clipPath = polygon(g.flap);
    // The back of the paper: lit along the fold, shading toward the lifted edge.
    this.flap.style.background = `linear-gradient(${back.angle}deg, ${shadow(0.2 * depth)} ${atBack}px, ${cream(0.1)} ${atBack + reach * 0.25}px, ${cream(0.04)} ${atBack + reach * 0.7}px, ${shadow(0.12 * depth)} ${atBack + w}px), var(--sheet-bg)`;
  }

  /**
   * Moves the corner to `to` over `ms`, lifting it toward the middle of the
   * page on the way (a hand turning a page doesn't drag it along the edge).
   */
  animate(to: Pt, ms: number, lift = 0): Promise<void> {
    cancelAnimationFrame(this.frame);
    const from = { ...this.f };
    const t0 = performance.now();
    const towardMiddle = this.cornerY === 0 ? 1 : -1;
    return new Promise((resolve) => {
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        // Decelerates into place without overshoot (--ease-settle).
        const e = 1 - Math.pow(1 - t, 3);
        this.set({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e + towardMiddle * lift * Math.sin(Math.PI * e) });
        if (t < 1) this.frame = requestAnimationFrame(step);
        else resolve();
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.layer.remove();
  }
}
