// First appearances (style.md §11): a meter fills and a row settles in the
// first time it scrolls into view, and never again for the same key, so
// switching tabs or editing doesn't replay the motion.

const seen = new Set<string>();
let observer: IntersectionObserver | null = null;
const pending = new Map<Element, () => void>();

function watch(node: Element, run: () => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    run();
    return () => undefined;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        pending.get(entry.target)?.();
        pending.delete(entry.target);
        observer!.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  pending.set(node, run);
  observer.observe(node);
  return () => {
    pending.delete(node);
    observer?.unobserve(node);
  };
}

/** True the first time a key is asked about. */
export function firstTime(key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export function hasAppeared(key: string): boolean {
  return seen.has(key);
}

/** Calls `run` once, when the node first scrolls into view; at once if the key appeared before. */
export function onFirstView(node: Element, key: string, run: (animate: boolean) => void): () => void {
  if (seen.has(key)) {
    run(false);
    return () => undefined;
  }
  return watch(node, () => {
    seen.add(key);
    run(true);
  });
}

/** Svelte attachment-style action: `use:settle={'ledger-row-cover'}`. */
export function settle(node: HTMLElement, key: string) {
  if (seen.has(key)) return {};
  node.classList.add('settle-wait');
  const stop = onFirstView(node, key, (animate) => {
    node.classList.remove('settle-wait');
    if (animate) node.classList.add('settle-in');
  });
  return { destroy: stop };
}
