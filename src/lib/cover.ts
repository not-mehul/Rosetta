// Covers for books that have none: a flat token tint, a spine, the title in
// the display serif and the author in mono caps. The tint comes from the
// book's fingerprint, so a book keeps its colour on every device and in both
// themes. Cover.svelte draws it with CSS; drawCover() paints the same thing on
// a canvas for the Android widget, which can only show a picture.

import type { StoredDoc } from '../state/db';

/** The accent each tint washes the cover with (style.md §3.3; seasoning, at 12–16%). */
export const TINTS = ['--accent-amber-rgb', '--accent-sage-rgb', '--cream-rgb', '--accent-bright-rgb'] as const;

/** Which tint a book gets: the same one wherever its fingerprint is. */
export function coverTint(id: string): number {
  let h = 0;
  for (let i = 0; i < Math.min(id.length, 16); i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % TINTS.length;
}

/** The first letter worth showing on a small cover: "The Salt Road" → "S". */
export function coverInitial(title: string): string {
  const words = title.trim().split(/\s+/);
  const word = words.length > 1 && /^(the|a|an|le|la|les|el|los|las|der|die|das)$/i.test(words[0]!) ? words[1]! : (words[0] ?? '');
  return [...word.replace(/^[^\p{L}\p{N}]+/u, '')][0]?.toLocaleUpperCase() ?? '·';
}

/** Lines of `text` that fit `width` in the context's current font, at most `max`, the last ending in "…" if cut. */
export function wrapLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, width: number, max: number): string[] {
  const lines: string[] = [];
  let line = '';
  const words = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (ctx.measureText(next).width <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i]!;
    if (lines.length === max) {
      line = '';
      break;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max || (lines.length === max && words.join(' ') !== lines.join(' '))) {
    lines.length = max;
    let last = lines[max - 1]!;
    while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1);
    lines[max - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

/**
 * The generated cover as a JPEG, in Dusk (the widget's own look), for books
 * without a picture. Token values are read from a Dusk probe, so no colour is
 * written here. Null when the canvas can't be used.
 */
export async function drawCover(doc: Pick<StoredDoc, 'id' | 'title' | 'author'>, width = 240): Promise<Uint8Array | null> {
  try {
    const probe = document.createElement('div');
    probe.dataset.theme = 'dark';
    probe.hidden = true;
    document.body.append(probe);
    const css = getComputedStyle(probe);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const rgb = token(TINTS[coverTint(doc.id)]!);
    const base = token('--bg-grad-mid');
    const heading = token('--text-heading');
    const dim = token('--text-dim');
    const serif = token('--font-serif') || 'serif';
    const mono = token('--font-mono') || 'monospace';
    probe.remove();
    await document.fonts?.load(`${Math.round(width * 0.125)}px ${serif}`).catch(() => undefined);

    const height = Math.round(width * 1.5);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const u = width / 100;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = `rgba(${rgb}, 0.16)`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = `rgba(${rgb}, 0.35)`;
    ctx.fillRect(0, 0, 8 * u, height);

    ctx.fillStyle = heading;
    ctx.font = `${12.5 * u}px ${serif}`;
    ctx.textBaseline = 'top';
    const lines = wrapLines(ctx, doc.title, width - 28 * u, 5);
    lines.forEach((line, i) => ctx.fillText(line, 18 * u, 12 * u + i * 14 * u));

    ctx.fillStyle = `rgba(${rgb}, 0.7)`;
    ctx.fillRect(18 * u, height - 22 * u, 30 * u, Math.max(1, u / 2));
    if (doc.author) {
      ctx.fillStyle = dim;
      ctx.font = `${5.5 * u}px ${mono}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(wrapLines(ctx, doc.author.toLocaleUpperCase(), width - 28 * u, 1)[0] ?? '', 18 * u, height - 12 * u);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
