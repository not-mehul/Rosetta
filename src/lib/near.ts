// Something is near the screen: within a screen's height of it. One shared
// observer, so a shelf of hundreds of covers costs one, not hundreds.

const waiting = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;

function watcher(): IntersectionObserver {
  return (observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        waiting.get(e.target)?.();
        waiting.delete(e.target);
        observer!.unobserve(e.target);
      }
    },
    { rootMargin: '100% 0px' },
  ));
}

/** Svelte action: runs `arrive` once, the first time the node comes near the screen. */
export function near(node: Element, arrive: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    arrive();
    return {};
  }
  waiting.set(node, arrive);
  watcher().observe(node);
  return {
    destroy() {
      waiting.delete(node);
      observer?.unobserve(node);
    },
  };
}
