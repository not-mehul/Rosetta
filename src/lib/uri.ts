// Percent-decoding that never throws. Books and Android content URIs carry
// stray "%" signs ("100%.xhtml", "#note%E0"), and one bad escape must not
// stop a whole book from opening: the raw text is the best guess.

export function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // Decode what can be decoded, a run of escapes at a time, and keep the rest.
    return text.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        return run;
      }
    });
  }
}
