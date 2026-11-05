// Sentences for reading aloud: one utterance at a time, so the sentence being
// read can be highlighted and the reader can pause, stop or skip.

export interface Sentence {
  start: number;
  end: number;
  text: string;
}

/** Sentences of `text` from `from` on, skipping whitespace-only pieces. */
export function sentences(text: string, from = 0, lang?: string): Sentence[] {
  const out: Sentence[] = [];
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    for (const s of new Seg(lang, { granularity: 'sentence' }).segment(text)) {
      const end = s.index + s.segment.length;
      if (end <= from) continue;
      push(out, text, Math.max(s.index, from), end);
    }
  } else {
    const re = /[^.!?。！？\n]+(?:[.!?。！？]+["'”’)\]]*|\n|$)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!m[0]) {
        re.lastIndex++;
        continue;
      }
      const end = m.index + m[0].length;
      if (end > from) push(out, text, Math.max(m.index, from), end);
    }
  }
  return out;
}

function push(out: Sentence[], text: string, start: number, end: number) {
  // Long paragraphs without full stops are split at about 300 characters, on a space.
  let a = start;
  while (a < end) {
    let b = end;
    if (b - a > 320) {
      const space = text.lastIndexOf(' ', a + 300);
      b = space > a + 40 ? space + 1 : a + 300;
    }
    const piece = text.slice(a, b);
    const lead = piece.length - piece.trimStart().length;
    const trimmed = piece.trim();
    if (trimmed) out.push({ start: a + lead, end: a + lead + trimmed.length, text: trimmed.replace(/\s+/g, ' ') });
    a = b;
  }
}
