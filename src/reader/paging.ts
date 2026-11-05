// Paged reading: the section is laid out in CSS columns one screen wide, and
// a page is one column. Places stay character offsets, so a page is found
// from the first character on it and the place survives any change of type.

/** The text nodes of a laid-out section with where each starts, for quick lookups. */
export class TextIndex {
  readonly nodes: Text[] = [];
  readonly starts: number[] = [];
  readonly length: number;

  constructor(root: Node) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let total = 0;
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (!n.length) continue;
      this.nodes.push(n);
      this.starts.push(total);
      total += n.length;
    }
    this.length = total;
  }

  /** The node holding character `offset`. */
  nodeAt(offset: number): number {
    let lo = 0;
    let hi = this.nodes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** The box of the character at `offset`, or null for a character with no box (collapsed space). */
  rectAt(offset: number): DOMRect | null {
    if (!this.nodes.length) return null;
    const i = this.nodeAt(Math.min(offset, this.length - 1));
    const node = this.nodes[i]!;
    const at = Math.max(0, Math.min(node.length - 1, offset - this.starts[i]!));
    const r = document.createRange();
    r.setStart(node, at);
    r.setEnd(node, at + 1);
    const rects = r.getClientRects();
    const rect = rects[rects.length - 1] ?? r.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }
}

export interface Columns {
  /** Left edge of page 0 on screen, before any turn (the column origin). */
  origin: number;
  /** One page plus the gap: how far a turn moves. */
  stride: number;
  rtl: boolean;
}

/** The page a box sits on. */
export function pageOfRect(rect: DOMRect, c: Columns): number {
  const x = c.rtl ? c.origin - rect.right : rect.left - c.origin;
  return Math.max(0, Math.floor((x + 1) / c.stride));
}

/** The page character `offset` is on; characters with no box take the next one that has one. */
export function pageOfOffset(index: TextIndex, offset: number, c: Columns): number {
  return findPage(index, offset, c) ?? 0;
}

/** As pageOfOffset, but null when nothing near the offset has a box (the section isn't laid out). */
export function findPage(index: TextIndex, offset: number, c: Columns): number | null {
  for (let o = Math.max(0, Math.min(offset, index.length - 1)), tries = 0; o < index.length && tries < 64; o++, tries++) {
    const rect = index.rectAt(o);
    if (rect) return pageOfRect(rect, c);
  }
  return null;
}

/**
 * The first character on `page`: a binary search over the characters, whose
 * pages only grow in reading order.
 */
export function firstOffsetOnPage(index: TextIndex, page: number, c: Columns): number {
  if (page <= 0 || !index.length) return 0;
  let lo = 0;
  let hi = index.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pageOfOffset(index, mid, c) >= page) hi = mid;
    else lo = mid + 1;
  }
  return Math.min(lo, index.length);
}

/** Pages in a laid-out column box. */
export function pageCount(scrollWidth: number, stride: number): number {
  return Math.max(1, Math.round(scrollWidth / stride) || 1);
}
