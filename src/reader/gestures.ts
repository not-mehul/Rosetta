// How a touch, a tap or a key turns into a page turn in a paged book. These are
// the decisions only: FlowView owns the page, the curl and the motion. In a
// right-to-left book every direction is mirrored, so "forward" (1) is the next
// page whichever way the lines run.

export type Turn = 1 | -1;

/** Under this many pixels sideways a touch is still a tap. */
export const SWIPE_START = 12;
/** A swipe turns the page past this share of the page's width... */
export const SWIPE_FAR = 0.22;
/** ...or when it is moving faster than this, in pixels per millisecond. */
export const SWIPE_FLICK = 0.45;

/** The way a finger is turning, once it has moved far enough sideways to be a swipe; 0 while it might still be a tap, a scroll or a selection. */
export function swipeDirection(dx: number, dy: number, rtl: boolean, selecting: boolean): Turn | 0 {
  if (selecting || Math.abs(dx) < SWIPE_START || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return (dx < 0) !== rtl ? 1 : -1;
}

/** Whether a swipe that started turning `dir` finishes the turn when the finger lifts, or springs back. */
export function swipeCommits(dir: Turn, dx: number, ms: number, width: number, rtl: boolean): boolean {
  const speed = Math.abs(dx) / Math.max(1, ms);
  const far = Math.abs(dx) > width * SWIPE_FAR || speed > SWIPE_FLICK;
  const sameWay = dir === 1 ? (dx < 0) !== rtl : (dx > 0) !== rtl;
  return far && sameWay;
}

/** A tap at `x` (0 at the page's left edge, 1 at its right): the outer thirds turn the page, the middle (0) shows the bars. */
export function tapTurn(x: number, rtl: boolean): Turn | 0 {
  if (x >= 0.3 && x <= 0.7) return 0;
  return (x > 0.7) !== rtl ? 1 : -1;
}

/** The turn a key asks for; 0 for any other key. Shift+Space goes back. */
export function keyTurn(key: string, shift: boolean, rtl: boolean): Turn | 0 {
  if (key === ' ' && shift) return -1;
  if (['ArrowRight', 'PageDown', ' '].includes(key)) return rtl ? -1 : 1;
  if (['ArrowLeft', 'PageUp'].includes(key)) return rtl ? 1 : -1;
  return 0;
}

/** A book's internal link, `section#anchor`, where an empty section means the one on screen. The section is NaN when the link is broken. */
export function linkTarget(to: string, current: number): { section: number; anchor: string | undefined } {
  const [part, anchor] = to.split('#');
  return { section: part === '' ? current : Number(part), anchor: anchor || undefined };
}
