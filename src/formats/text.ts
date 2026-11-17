// Text in whatever encoding it came in. Most files are UTF-8, but plenty
// aren't: Windows Notepad's "Unicode" is UTF-16, older Gutenberg and office
// files are Windows-1252, and older Russian FictionBooks are windows-1251.
// A file that says its encoding (an XML declaration, an HTML meta charset)
// is read in it; one that doesn't falls back to Windows-1252, which never fails.

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });

/** The encoding a byte-order mark gives, if there is one. */
export function bomEncoding(bytes: Uint8Array): 'utf-8' | 'utf-16le' | 'utf-16be' | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

/** Whether the bytes are valid UTF-8, allowing a character cut off at the end of a slice. */
export function isUtf8(bytes: Uint8Array, whole = true): boolean {
  try {
    strictUtf8.decode(whole ? bytes : trimPartial(bytes));
    return true;
  } catch {
    return false;
  }
}

/** Drops a multi-byte character cut off at the end of a slice. */
function trimPartial(bytes: Uint8Array): Uint8Array {
  const end = bytes.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const b = bytes[end - i]!;
    if ((b & 0xc0) === 0xc0) return bytes.subarray(0, end - i);
    if ((b & 0x80) === 0) break;
  }
  return bytes;
}

/** The encoding an XML declaration or HTML meta tag names in the first bytes, if a TextDecoder knows it. */
function declaredEncoding(bytes: Uint8Array): string | null {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  const name = /<\?xml[^>]*\bencoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1] ?? /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1];
  if (!name) return null;
  try {
    return new TextDecoder(name).encoding;
  } catch {
    return null;
  }
}

/** The encoding to read a text file in. */
export function textEncoding(bytes: Uint8Array): string {
  const bom = bomEncoding(bytes);
  if (bom) return bom;
  // Valid UTF-8 with any non-ASCII in it is almost never anything else, whatever a tag says.
  if (isUtf8(bytes)) return 'utf-8';
  // Otherwise what the file says, but not a UTF-8 it isn't (common in old HTML).
  const declared = declaredEncoding(bytes);
  return declared && declared !== 'utf-8' ? declared : 'windows-1252';
}

/** A text file's contents, without a byte-order mark and with \n line endings. */
export function decodeText(bytes: Uint8Array): string {
  return new TextDecoder(textEncoding(bytes))
    .decode(bytes)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
}

/**
 * Whether a file looks like text in some encoding: a UTF-16 byte-order mark,
 * or no NUL bytes and almost no control characters in the first 4 KB. (Which
 * encoding is textEncoding()'s question.)
 */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bomEncoding(bytes)?.startsWith('utf-16')) return true;
  const head = bytes.subarray(0, 4096);
  if (!head.length || head.includes(0)) return false;
  // Text, in any encoding, is letters and punctuation, not control codes.
  let control = 0;
  for (const b of head) if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0c && b !== 0x0d && b !== 0x1b) control++;
  return control <= head.length / 100;
}
