// The theme changing as a circle spreading from the tap (style.md §11: motion
// that shows where something came from). Through the View Transitions API
// where the WebView has it; elsewhere, and under reduced motion, the theme
// simply changes.

type Doc = Document & { startViewTransition?: (update: () => Promise<void> | void) => { ready: Promise<void> } };

export async function reveal(from: Element | null, change: () => Promise<void> | void): Promise<void> {
  const doc = document as Doc;
  if (!doc.startViewTransition || !from || matchMedia('(prefers-reduced-motion: reduce)').matches) return void (await change());
  const box = from.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  // Far enough to reach the corner furthest from the tap.
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const spring = getComputedStyle(document.documentElement);
  const transition = doc.startViewTransition(() => change());
  await transition.ready.catch(() => undefined);
  document.documentElement.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
    {
      duration: parseFloat(spring.getPropertyValue('--spring-spatial-slow-dur')) || 600,
      easing: spring.getPropertyValue('--spring-spatial-calm').trim() || 'ease-out',
      pseudoElement: '::view-transition-new(root)',
    },
  );
}
