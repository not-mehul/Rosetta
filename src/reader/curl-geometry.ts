// The geometry of a page being turned. The page is a W×H rectangle held by
// its left edge (the spine). Its free corner C, on the right, is lifted to the
// finger F and the paper folds along the perpendicular bisector of C→F:
//
//   - kept: the part of the page still lying flat (on the spine's side),
//   - removed: the part lifted off, which reveals the next page beneath,
//   - flap: the lifted part reflected across the fold, showing its back.
//
// Everything is in page coordinates, (0, 0) at the top left.

export interface Pt {
  x: number;
  y: number;
}

export interface Fold {
  kept: Pt[];
  removed: Pt[];
  flap: Pt[];
  /** A point on the fold line, and the unit normal pointing from the fold toward the corner. */
  mid: Pt;
  normal: Pt;
  /** How far the page is turned, 0 (flat) to 1 (over). */
  turned: number;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);

/** Clips a convex polygon to the half-plane where (P − M)·n ≤ 0 (Sutherland–Hodgman). */
export function clipHalfPlane(poly: Pt[], m: Pt, n: Pt): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => dot(sub(p, m), n);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** P reflected across the line through M with unit normal n. */
export function reflect(p: Pt, m: Pt, n: Pt): Pt {
  const d = 2 * dot(sub(p, m), n);
  return { x: p.x - d * n.x, y: p.y - d * n.y };
}

/**
 * Keeps the finger where a sheet of paper held at the spine can reach:
 * no further from either end of the spine than the paper itself.
 */
export function constrain(f: Pt, w: number, h: number, cornerY: number): Pt {
  let p = { ...f };
  const near: Pt = { x: 0, y: cornerY };
  const far: Pt = { x: 0, y: h - cornerY };
  const limit = (anchor: Pt, r: number) => {
    const d = sub(p, anchor);
    const l = len(d);
    if (l > r) p = { x: anchor.x + (d.x * r) / l, y: anchor.y + (d.y * r) / l };
  };
  limit(near, w);
  limit(far, Math.hypot(w, h));
  return p;
}

/** The fold for a page W×H whose corner (W, cornerY) is lifted to F. */
export function fold(w: number, h: number, cornerY: number, f: Pt): Fold {
  const c: Pt = { x: w, y: cornerY };
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const d = sub(c, f);
  const l = len(d);
  if (l < 0.5) return { kept: rect, removed: [], flap: [], mid: c, normal: { x: 1, y: 0 }, turned: 0 };
  const normal = { x: d.x / l, y: d.y / l };
  const mid = { x: (c.x + f.x) / 2, y: (c.y + f.y) / 2 };
  const kept = clipHalfPlane(rect, mid, normal);
  const removed = clipHalfPlane(rect, mid, { x: -normal.x, y: -normal.y });
  const flap = removed.map((p) => reflect(p, mid, normal));
  return { kept, removed, flap, mid, normal, turned: Math.max(0, Math.min(1, (w - f.x) / (2 * w))) };
}

/** A CSS polygon() for points in pixels. */
export function polygon(points: Pt[]): string {
  if (points.length < 3) return 'polygon(0 0, 0 0, 0 0)';
  return `polygon(${points.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ')})`;
}

/** CSS matrix() reflecting an element (transform-origin 0 0) across the fold. */
export function reflectionMatrix(mid: Pt, n: Pt): string {
  const a = 1 - 2 * n.x * n.x;
  const b = -2 * n.x * n.y;
  const dd = 1 - 2 * n.y * n.y;
  const k = 2 * dot(mid, n);
  return `matrix(${a}, ${b}, ${b}, ${dd}, ${k * n.x}, ${k * n.y})`;
}

/**
 * A linear-gradient angle along `dir` for a W×H box, and where a point falls
 * on that gradient's line in pixels, so stops can be placed on the fold.
 */
export function gradientLine(w: number, h: number, dir: Pt): { angle: number; at: (p: Pt) => number } {
  // CSS: 0deg points up, angles turn clockwise; the line passes through the centre.
  const angle = (Math.atan2(dir.x, -dir.y) * 180) / Math.PI;
  const rad = (angle * Math.PI) / 180;
  const u = { x: Math.sin(rad), y: -Math.cos(rad) };
  const length = Math.abs(w * u.x) + Math.abs(h * u.y);
  const centre = { x: w / 2, y: h / 2 };
  return { angle, at: (p) => dot(sub(p, centre), u) + length / 2 };
}
