// Visual anchors: the first letters of each word set in bold, so the eye has
// somewhere to land and the rest of the word is read from its shape. The bold
// is added as <b class="anchor"> around existing text, so the section's text,
// and every offset into it (places, marks, search), stays exactly the same.

const WORD = /[\p{L}\p{M}\p{N}'’-]+/gu;
/** Letters only: a word made of digits or marks gets no anchor. */
const LETTER = /\p{L}/u;

/** How many letters of a word of `length` letters to set in bold. */
export function anchorLength(length: number): number {
  if (length <= 1) return length;
  if (length <= 3) return 1;
  if (length === 4) return 2;
  return Math.ceil(length * 0.4);
}

export interface Run {
  text: string;
  anchor: boolean;
}

/** `text` cut into runs: the bold start of each word, and everything between. */
export function anchorRuns(text: string): Run[] {
  const runs: Run[] = [];
  let at = 0;
  const plain = (to: number) => {
    if (to <= at) return;
    const last = runs[runs.length - 1];
    if (last && !last.anchor) last.text += text.slice(at, to);
    else runs.push({ text: text.slice(at, to), anchor: false });
    at = to;
  };
  for (const m of text.matchAll(WORD)) {
    const word = m[0];
    if (!LETTER.test(word)) continue;
    // Count graphemes, not code units, so accents and surrogate pairs stay whole.
    const chars = [...word];
    const n = anchorLength(chars.filter((c) => LETTER.test(c)).length);
    if (!n) continue;
    plain(m.index);
    const bold = chars.slice(0, n).join('');
    runs.push({ text: bold, anchor: true });
    at = m.index + bold.length;
  }
  plain(text.length);
  return runs;
}

/** Elements whose text is left alone: code keeps its shape, and the anchors don't nest. */
const SKIP = 'pre, code, kbd, samp, script, style, svg, math, b.anchor';

/** Adds anchors to every word in `root`'s text. */
export function addAnchors(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) || !n.nodeValue?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const runs = anchorRuns(node.nodeValue!);
    if (!runs.some((r) => r.anchor)) continue;
    const frag = document.createDocumentFragment();
    for (const r of runs) {
      if (!r.anchor) frag.append(r.text);
      else {
        const b = document.createElement('b');
        b.className = 'anchor';
        b.textContent = r.text;
        frag.append(b);
      }
    }
    node.replaceWith(frag);
  }
}
