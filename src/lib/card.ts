// Quote cards (style.md §8.16): a highlight as a 1080×1350 image in the
// app's current theme. The palette is read from the tokens on a probe
// element, so the card follows Dusk or Dawn without a colour of its own.

import { t } from '../i18n/index.svelte';

export interface QuoteCard {
  quote: string;
  title: string;
  author: string;
  /** The eyebrow's date. */
  date: Date;
  locale: string;
  tagline: string;
}

const W = 1080;
const H = 1350;
const FRAME = 48;

function palette() {
  const probe = document.createElement('div');
  probe.dataset.theme = document.documentElement.dataset.theme ?? 'dark';
  document.body.appendChild(probe);
  const css = getComputedStyle(probe);
  const v = (name: string) => css.getPropertyValue(name).trim();
  const out = {
    top: v('--bg-grad-top'),
    mid: v('--bg-grad-mid'),
    bot: v('--bg-grad-bot'),
    heading: v('--text-heading'),
    body: v('--text-body'),
    dim: v('--text-dim'),
    amber: v('--accent-amber'),
    amberRgb: v('--accent-amber-rgb'),
    sageRgb: v('--accent-sage-rgb'),
    creamRgb: v('--cream-rgb'),
    serif: v('--font-serif') || 'serif',
    mono: v('--font-mono') || 'monospace',
  };
  probe.remove();
  return out;
}

/** Breaks text into lines that fit `width`, adding an ellipsis past `max` lines. */
export function wrap(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, width: number, max: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
    if (lines.length === max) break;
  }
  if (lines.length < max && line) lines.push(line);
  if (lines.length === max && lines.join(' ').length < text.trim().length) {
    let last = lines[max - 1]!;
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[max - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

export async function renderQuoteCard(card: QuoteCard): Promise<Uint8Array> {
  await document.fonts?.ready;
  const p = palette();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.top);
  bg.addColorStop(0.5, p.mid);
  bg.addColorStop(1, p.bot);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // The three glows, at twice their page opacity.
  const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb}, ${a})`);
    g.addColorStop(0.35, `rgba(${rgb}, ${a * 0.3})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.95, H * 0.05, 700, p.amberRgb, 0.2);
  glow(W * 0.05, H * 1.05, 800, p.sageRgb, 0.16);
  glow(W * 0.5, H * 0.6, 480, p.creamRgb, 0.06);

  // Hairline frame and corner brackets.
  ctx.strokeStyle = `rgba(${p.amberRgb}, 0.3)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(FRAME, FRAME, W - 2 * FRAME, H - 2 * FRAME);
  ctx.strokeStyle = p.amber;
  ctx.lineWidth = 3;
  const b = 36;
  for (const [x, y, dx, dy] of [
    [FRAME, FRAME, 1, 1],
    [W - FRAME, FRAME, -1, 1],
    [FRAME, H - FRAME, 1, -1],
    [W - FRAME, H - FRAME, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x + dx * b, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * b);
    ctx.stroke();
  }

  const left = FRAME + 72;
  const width = W - 2 * left;
  ctx.textBaseline = 'alphabetic';

  // Eyebrow: the app and the date.
  ctx.fillStyle = p.amber;
  ctx.font = `500 26px ${p.mono}`;
  ctx.fillText(`ROSETTA · ${card.date.toLocaleDateString(card.locale, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}`, left, FRAME + 110);

  // The quote, the hero.
  ctx.fillStyle = p.heading;
  let size = 64;
  let lines: string[] = [];
  for (; size >= 40; size -= 4) {
    ctx.font = `italic 400 ${size}px ${p.serif}`;
    lines = wrap(ctx, `“${card.quote}”`, width, 11);
    if (lines.length * size * 1.3 < H - 640) break;
  }
  let y = FRAME + 240;
  for (const line of lines) {
    ctx.fillText(line, left, y);
    y += size * 1.3;
  }

  // Title and author.
  y += 40;
  ctx.fillStyle = p.amber;
  ctx.fillRect(left, y - 20, 64, 2);
  y += 40;
  ctx.fillStyle = p.body;
  ctx.font = `500 40px ${p.serif}`;
  for (const line of wrap(ctx, card.title, width, 2)) {
    ctx.fillText(line, left, y);
    y += 52;
  }
  if (card.author) {
    ctx.fillStyle = p.dim;
    ctx.font = `400 30px ${p.serif}`;
    ctx.fillText(wrap(ctx, card.author, width, 1)[0] ?? '', left, y + 4);
  }

  // Footer: app name left, tagline right.
  ctx.fillStyle = p.dim;
  ctx.font = `500 24px ${p.mono}`;
  ctx.fillText('ROSETTA', left, H - FRAME - 64);
  const tag = card.tagline.toUpperCase();
  ctx.fillText(tag, W - left - ctx.measureText(tag).width, H - FRAME - 64);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error(t('error.cardDraw'));
  return new Uint8Array(await blob.arrayBuffer());
}
