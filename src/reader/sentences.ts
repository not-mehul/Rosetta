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

/** Text with a space put in at each of `joins` (a PDF's line ends and word gaps), and where each of its characters came from. */
export function withSpaces(text: string, joins: readonly number[]): { text: string; from: number[] } {
  let out = '';
  const from: number[] = [];
  let j = 0;
  for (let i = 0; i <= text.length; i++) {
    while (j < joins.length && joins[j]! <= i) {
      if (joins[j] === i) {
        out += ' ';
        from.push(i);
      }
      j++;
    }
    if (i < text.length) {
      out += text[i];
      from.push(i);
    }
  }
  from.push(text.length);
  return { text: out, from };
}

/**
 * Sentences of text whose spaces are only implied at `joins`: found and
 * spoken with the spaces in, placed by the text's own offsets.
 */
export function sentencesWithJoins(text: string, joins: readonly number[], from = 0, lang?: string): Sentence[] {
  if (!joins.length) return sentences(text, from, lang);
  const spaced = withSpaces(text, joins);
  const start = Math.max(0, spaced.from.findIndex((o) => o >= from));
  return sentences(spaced.text, start, lang).map((s) => ({ ...s, start: spaced.from[s.start] ?? text.length, end: spaced.from[s.end] ?? text.length }));
}
