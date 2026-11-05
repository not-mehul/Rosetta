// Tracks the text selection inside the page, for the selection bar.

import { selectionOffsets } from './offsets';

export interface PageSelection {
  /** The section (or PDF page) the selection is in. */
  section: number;
  start: number;
  end: number;
  text: string;
  rect: DOMRect;
}

/**
 * Watches selectionchange; `rootFor` maps the selection's start node to the
 * section root it is in, if any. Returns a stop function.
 */
export function watchSelection(rootFor: (node: Node) => { root: Element; section: number } | null, onchange: (sel: PageSelection | null) => void): () => void {
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return onchange(null);
      const range = selection.getRangeAt(0);
      const target = rootFor(range.startContainer);
      if (!target || !target.root.contains(range.endContainer)) return onchange(null);
      const at = selectionOffsets(target.root, selection);
      if (!at) return onchange(null);
      onchange({ section: target.section, ...at, rect: range.getBoundingClientRect() });
    });
  };
  document.addEventListener('selectionchange', update);
  addEventListener('scroll', update, { passive: true });
  return () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('selectionchange', update);
    removeEventListener('scroll', update);
  };
}
