// Places in a section are character offsets into its textContent. They survive
// any change of font, size or width, which a scroll position would not, and
// they are what bookmarks, highlights, search hits and the resume point store.

/** The offset of (node, offset) within `root`'s text. */
export function textOffset(root: Node, node: Node, offset: number): number {
  if (node.nodeType !== Node.TEXT_NODE) {
    // A point between children: count the text of the children before it.
    const before = document.createRange();
    before.setStart(root, 0);
    before.setEnd(node, offset);
    return before.toString().length;
  }
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n === node) return total + offset;
    total += n.nodeValue?.length ?? 0;
  }
  return total;
}

/** The text node and offset at a character offset (clamped to the text). */
export function pointAt(root: Node, offset: number, preferNext = false): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  let total = 0;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const len = n.length;
    // At a boundary, an end point stays in the earlier node and a start point moves to the next.
    if (offset < total + len || (offset === total + len && !preferNext)) return { node: n, offset: offset - total };
    total += len;
    last = n;
  }
  return last ? { node: last, offset: last.length } : null;
}

export function rangeAt(root: Node, start: number, end: number): Range | null {
  const a = pointAt(root, start, true);
  const b = pointAt(root, Math.max(start, end));
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** The selection as offsets in `root`, or null when it isn't inside it. */
export function selectionOffsets(root: Node, selection: Selection | null): { start: number; end: number; text: string } | null {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const start = textOffset(root, range.startContainer, range.startOffset);
  const end = textOffset(root, range.endContainer, range.endOffset);
  const text = range.toString().replace(/\s+/g, ' ').trim();
  return end > start && text ? { start, end, text } : null;
}

export interface Paint {
  id: string;
  start: number;
  end: number;
  /** Class names for the <mark>s. */
  className: string;
}

/** Removes every mark this module added, leaving the text as it was. */
export function unpaint(root: Element, selector = 'mark[data-mark]'): void {
  const parents = new Set<Node>();
  for (const mark of root.querySelectorAll(selector)) {
    const parent = mark.parentNode!;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parents.add(parent);
  }
  for (const p of parents) p.normalize();
}

/**
 * Wraps each paint's text in <mark data-mark="id">: one mark per text node it
 * crosses, so marks never straddle block boundaries.
 */
export function paint(root: Element, paints: Paint[]): void {
  // Offsets are into the unmarked text, and marks don't change the text, so order doesn't matter.
  for (const p of paints) {
    const range = rangeAt(root, p.start, p.end);
    if (!range || range.collapsed) continue;
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentNode! : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if (range.intersectsNode(n) && n.length) nodes.push(n);
    }
    for (let node of nodes) {
      const from = node === range.startContainer ? range.startOffset : 0;
      const to = node === range.endContainer ? range.endOffset : node.length;
      if (to <= from) continue;
      if (to < node.length) node.splitText(to);
      if (from > 0) node = node.splitText(from);
      if (!node.nodeValue?.trim()) continue;
      const mark = document.createElement('mark');
      mark.dataset.mark = p.id;
      mark.className = p.className;
      node.replaceWith(mark);
      mark.appendChild(node);
    }
  }
}

const bottomOf = (node: Node) => {
  const r = document.createRange();
  r.selectNodeContents(node);
  return r.getBoundingClientRect().bottom;
};

/**
 * The first character on screen at or below `top` (a viewport y). Blocks are
 * found by binary search, then the character inside the text node, so it stays
 * quick in a long chapter and gives the same answer every time.
 */
export function firstVisibleOffset(root: Element, top: number): number {
  const box = root.getBoundingClientRect();
  if (box.top >= top) return 0;
  if (box.bottom <= top) return root.textContent?.length ?? 0;
  const kids = root.children;
  let lo = 0;
  let hi = kids.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (kids[mid]!.getBoundingClientRect().bottom > top) hi = mid;
    else lo = mid + 1;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  if (kids[lo]) walker.currentNode = kids[lo]!;
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (!n.length || bottomOf(n) <= top) continue;
    // The first character whose line reaches below `top`.
    const r = document.createRange();
    let a = 0;
    let b = n.length - 1;
    while (a < b) {
      const mid = (a + b) >> 1;
      r.setStart(n, mid);
      r.setEnd(n, mid + 1);
      const rect = r.getBoundingClientRect();
      if (rect.height && rect.bottom > top) b = mid;
      else a = mid + 1;
    }
    return textOffset(root, n, a);
  }
  return root.textContent?.length ?? 0;
}

/** A short excerpt around [start, end) of `text`, with the match split out. */
export function excerpt(text: string, start: number, end: number, around = 48): { before: string; match: string; after: string } {
  const from = Math.max(0, start - around);
  const to = Math.min(text.length, end + around);
  const squash = (s: string) => s.replace(/\s+/g, ' ');
  return {
    before: (from > 0 ? '…' : '') + squash(text.slice(from, start)).trimStart(),
    match: squash(text.slice(start, end)),
    after: squash(text.slice(end, to)).trimEnd() + (to < text.length ? '…' : ''),
  };
}
