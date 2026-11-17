// Icons answer a tap (style.md §11: motion with a job). When a button, tab,
// chip or link with an icon is pressed, its icon plays its own short motion,
// drawn in src/styles/motion.css: the gear turns, the bookmark drops, the
// bars of the chart grow, the bin's lid lifts. Nothing loops, nothing plays
// on its own, and none of it runs under reduced motion (the CSS is behind
// prefers-reduced-motion: no-preference).
//
// One listener for the whole app: a control that swaps its icon as it is
// pressed (bookmark → bookmark-check, play → pause) gets the new icon's
// motion, because the icon is looked up a frame after the press.

/** Longest motion in motion.css, plus a little: when data-play comes off. */
const PLAY_MS = 900;
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

const HOSTS = 'button, a[href], [role="tab"], [role="radio"], [role="switch"], [role="menuitem"]';

/** Plays an icon's motion from the start, even if it is still playing. */
export function playIcon(svg: Element | null | undefined): void {
  if (!svg) return;
  // Every drawn part measured as 1, so a stroke can be drawn in whatever its length.
  for (const part of svg.children) if (!part.hasAttribute('pathLength')) part.setAttribute('pathLength', '1');
  svg.removeAttribute('data-play');
  // A reflow between, so taking it off and putting it back restarts the animation.
  void (svg as SVGElement).getBoundingClientRect();
  svg.setAttribute('data-play', '');
  clearTimeout(timers.get(svg));
  timers.set(
    svg,
    setTimeout(() => svg.removeAttribute('data-play'), PLAY_MS),
  );
}

/** The icon a control shows: its own, not one inside something it holds (a list row's share button). */
function iconOf(host: Element): Element | null {
  for (const svg of host.querySelectorAll('svg[data-icon]')) if (svg.closest(HOSTS) === host) return svg;
  return null;
}

export function startIconMotion(root: Document = document): () => void {
  const onclick = (e: Event) => {
    const host = (e.target as Element | null)?.closest?.(HOSTS);
    if (!host || host.matches(':disabled, [aria-disabled="true"]')) return;
    // A frame later: after the press has changed the control (an icon swapped, a tab selected).
    requestAnimationFrame(() => {
      if (host.isConnected) playIcon(iconOf(host));
    });
  };
  root.addEventListener('click', onclick, true);
  return () => root.removeEventListener('click', onclick, true);
}
