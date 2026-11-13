// DRM-free Kindle books: MOBI (and its .prc/.azw names) and KF8 (.azw3).
// Both are Palm database files: record 0 says how the text is compressed
// (PalmDOC LZ77 or HUFF/CDIC), which records hold it and where the images
// start; the EXTH block carries the title, author, language and cover.
//
// Old MOBI text is one HTML stream split by <mbp:pagebreak>, with links as
// byte offsets (filepos) and images by record number (recindex). KF8 keeps
// each chapter as a skeleton followed by its fragments; appended in order and
// parsed as HTML, they read the same, which is all a reflowing reader needs.
// A book with DRM is refused plainly: Rosetta never removes it.

import {
  FormatError,
  type DocInfo,
  type FlowDoc,
  type Section,
  type TocEntry,
} from "./types";
import { clean } from "./sanitize";
import { t } from "../i18n/index.svelte";

const NONE = 0xffffffff;

const u16 = (b: Uint8Array, at: number) => ((b[at]! << 8) | b[at + 1]!) >>> 0;
const u32 = (b: Uint8Array, at: number) =>
  ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
const ascii = (b: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...b.subarray(at, at + length));

/** The records of a Palm database, as views into the file. */
function records(bytes: Uint8Array): Uint8Array[] {
  if (bytes.length < 86) throw new FormatError(t("error.unknown"));
  const count = u16(bytes, 76);
  const starts: number[] = [];
  for (let i = 0; i < count; i++) starts.push(u32(bytes, 78 + i * 8));
  return starts.map((start, i) =>
    bytes.subarray(start, i + 1 < count ? starts[i + 1] : bytes.length),
  );
}

export const isMobi = (bytes: Uint8Array) =>
  bytes.length > 68 && ascii(bytes, 60, 8) === "BOOKMOBI";

interface Header {
  /** Index of this header's record 0 (non-zero for the KF8 half of a joint file). */
  start: number;
  compression: number;
  textLength: number;
  textRecords: number;
  encryption: number;
  encoding: string;
  version: number;
  firstImage: number;
  huffRecord: number;
  huffCount: number;
  extraFlags: number;
  fdst: number;
  exth: Map<number, Uint8Array[]>;
  fullName: string;
}

function header(recs: Uint8Array[], start: number): Header {
  const r = recs[start];
  if (!r || r.length < 32 || ascii(r, 16, 4) !== "MOBI")
    throw new FormatError(t("error.unknown"));
  const length = u32(r, 20);
  const field = (at: number) =>
    at + 4 <= 16 + length && at + 4 <= r.length ? u32(r, at) : NONE;
  const exth = new Map<number, Uint8Array[]>();
  const exthAt = 16 + length;
  if (
    field(0x80) !== NONE &&
    field(0x80) & 0x40 &&
    ascii(r, exthAt, 4) === "EXTH"
  ) {
    const count = u32(r, exthAt + 8);
    let at = exthAt + 12;
    for (let i = 0; i < count && at + 8 <= r.length; i++) {
      const type = u32(r, at);
      const size = u32(r, at + 4);
      if (size < 8) break;
      exth.set(type, [
        ...(exth.get(type) ?? []),
        r.subarray(at + 8, at + size),
      ]);
      at += size;
    }
  }
  const encoding = field(0x1c) === 65001 ? "utf-8" : "windows-1252";
  const nameAt = field(0x54);
  const nameLength = field(0x58);
  const fullName =
    nameAt !== NONE && nameLength !== NONE && nameAt + nameLength <= r.length
      ? new TextDecoder(encoding).decode(
          r.subarray(nameAt, nameAt + nameLength),
        )
      : "";
  return {
    start,
    compression: u16(r, 0),
    textLength: u32(r, 4),
    textRecords: u16(r, 8),
    encryption: u16(r, 12),
    encoding,
    version: field(0x24),
    firstImage: field(0x6c),
    huffRecord: field(0x70),
    huffCount: field(0x74),
    extraFlags: length >= 0xe4 && r.length >= 0xf4 ? u16(r, 0xf2) : 0,
    fdst: field(0xc0),
    exth,
    fullName,
  };
}

/** The header to read: KF8 for an .azw3, the old MOBI half of a joint file (its links resolve). */
function chooseHeader(recs: Uint8Array[]): Header {
  const first = header(recs, 0);
  if (first.encryption !== 0) throw new FormatError(t("error.mobiDrm"));
  return first;
}

const exthText = (h: Header, type: number) =>
  (h.exth.get(type) ?? [])
    .map((v) => new TextDecoder(h.encoding).decode(v).trim())
    .filter(Boolean);
const exthNumber = (h: Header, type: number) => {
  const v = h.exth.get(type)?.[0];
  return v && v.length >= 4 ? u32(v, 0) : NONE;
};

// ---- Decompression ------------------------------------------------------

/** PalmDOC's LZ77: literals, runs of literals, back-references and space-plus-character pairs. */
export function palmDoc(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.max(4096, data.length * 8));
  let o = 0;
  let i = 0;
  while (i < data.length) {
    const c = data[i++]!;
    if (c >= 1 && c <= 8) {
      for (let k = 0; k < c && i < data.length; k++) out[o++] = data[i++]!;
    } else if (c < 0x80) {
      out[o++] = c;
    } else if (c >= 0xc0) {
      out[o++] = 0x20;
      out[o++] = c ^ 0x80;
    } else if (i < data.length) {
      const pair = (c << 8) | data[i++]!;
      const distance = (pair >> 3) & 0x7ff;
      const length = (pair & 7) + 3;
      if (distance === 0 || distance > o) continue;
      for (let k = 0; k < length; k++, o++) out[o] = out[o - distance]!;
    }
  }
  return out.subarray(0, o);
}

/** HUFF/CDIC: a Huffman code over a dictionary of phrases, which may themselves be compressed. */
class Huffman {
  private dict1: [number, boolean, number][] = [];
  private mincode: number[] = [];
  private maxcode: number[] = [];
  private phrases: { data: Uint8Array; done: boolean }[] = [];

  constructor(huff: Uint8Array, cdics: Uint8Array[]) {
    if (ascii(huff, 0, 4) !== "HUFF") throw new FormatError(t("error.unknown"));
    const off1 = u32(huff, 8);
    const off2 = u32(huff, 12);
    for (let i = 0; i < 256; i++) {
      const v = u32(huff, off1 + i * 4);
      const length = v & 0x1f;
      this.dict1.push([
        length,
        (v & 0x80) !== 0,
        (Math.floor(v / 256) + 1) * 2 ** (32 - length) - 1,
      ]);
    }
    this.mincode.push(0);
    this.maxcode.push(0);
    for (let length = 1; length <= 32; length++) {
      this.mincode.push(
        u32(huff, off2 + (length - 1) * 8) * 2 ** (32 - length),
      );
      this.maxcode.push(
        (u32(huff, off2 + (length - 1) * 8 + 4) + 1) * 2 ** (32 - length) - 1,
      );
    }
    for (const cdic of cdics) {
      if (ascii(cdic, 0, 4) !== "CDIC") continue;
      const total = u32(cdic, 8);
      const bits = u32(cdic, 12);
      const n = Math.min(2 ** bits, total - this.phrases.length);
      for (let i = 0; i < n; i++) {
        const at = u16(cdic, 16 + i * 2);
        const length = u16(cdic, 16 + at);
        this.phrases.push({
          data: cdic.subarray(18 + at, 18 + at + (length & 0x7fff)),
          done: (length & 0x8000) !== 0,
        });
      }
    }
  }

  unpack(data: Uint8Array, depth = 0): Uint8Array {
    if (depth > 32) return new Uint8Array();
    const padded = new Uint8Array(data.length + 8);
    padded.set(data);
    const parts: Uint8Array[] = [];
    let total = 0;
    let bitsLeft = data.length * 8;
    let pos = 0;
    while (true) {
      // The next 32 bits from bit `pos`.
      const at = pos >> 3;
      const shift = pos & 7;
      const code =
        ((u32(padded, at) << shift) | (padded[at + 4]! >>> (8 - shift))) >>> 0;
      const entry = this.dict1[code >>> 24]!;
      let length = entry[0];
      let maxcode = entry[2];
      if (!entry[1]) {
        while (length < 32 && code < this.mincode[length]!) length++;
        maxcode = this.maxcode[length]!;
      }
      if (length === 0) break;
      pos += length;
      bitsLeft -= length;
      if (bitsLeft < 0) break;
      const index = Math.floor((maxcode - code) / 2 ** (32 - length));
      const phrase = this.phrases[index];
      if (!phrase) break;
      if (!phrase.done) {
        phrase.data = this.unpack(phrase.data, depth + 1);
        phrase.done = true;
      }
      parts.push(phrase.data);
      total += phrase.data.length;
    }
    return join(parts, total);
  }
}

function join(
  parts: Uint8Array[],
  total = parts.reduce((n, p) => n + p.length, 0),
): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The size of one trailing entry, read backwards from the end of a record. */
function trailingEntry(data: Uint8Array, end: number): number {
  let n = 0;
  for (let i = Math.max(0, end - 4); i < end; i++) {
    const v = data[i]!;
    if (v & 0x80) n = 0;
    n = (n << 7) | (v & 0x7f);
  }
  return n;
}

/** A text record without the extra data some writers append to it. */
export function withoutTrailing(data: Uint8Array, flags: number): Uint8Array {
  let end = data.length;
  for (let f = flags >> 1; f; f >>= 1)
    if (f & 1) end -= Math.min(end, trailingEntry(data, end));
  if (flags & 1 && end > 0) end -= (data[end - 1]! & 3) + 1;
  return data.subarray(0, Math.max(0, end));
}

function text(recs: Uint8Array[], h: Header): Uint8Array {
  let unpack: (d: Uint8Array) => Uint8Array;
  if (h.compression === 1) unpack = (d) => d;
  else if (h.compression === 2) unpack = palmDoc;
  else if (h.compression === 17480 && h.huffRecord !== NONE) {
    const huff = new Huffman(
      recs[h.start + h.huffRecord]!,
      recs.slice(
        h.start + h.huffRecord + 1,
        h.start + h.huffRecord + h.huffCount,
      ),
    );
    unpack = (d) => huff.unpack(d);
  } else throw new FormatError(t("error.unknown"));
  const parts: Uint8Array[] = [];
  for (let i = 1; i <= h.textRecords; i++) {
    const r = recs[h.start + i];
    if (r) parts.push(unpack(withoutTrailing(r, h.extraFlags)));
  }
  const all = join(parts);
  return h.textLength && h.textLength < all.length
    ? all.subarray(0, h.textLength)
    : all;
}

// ---- Images ---------------------------------------------------------------

function imageType(data: Uint8Array | undefined): string | null {
  if (!data || data.length < 4) return null;
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (data[0] === 0x89 && ascii(data, 1, 3) === "PNG") return "image/png";
  if (ascii(data, 0, 3) === "GIF") return "image/gif";
  if (data[0] === 0x42 && data[1] === 0x4d) return "image/bmp";
  return null;
}

/** The record where the book's images start, as an absolute index. */
function imageBase(recs: Uint8Array[], h: Header): number {
  const given = h.firstImage !== NONE ? h.start + h.firstImage : NONE;
  if (given !== NONE && given < recs.length) return given;
  for (let i = h.start + h.textRecords + 1; i < recs.length; i++)
    if (imageType(recs[i])) return i;
  return recs.length;
}

function cover(
  recs: Uint8Array[],
  h: Header,
): { bytes: Uint8Array; type: string } | null {
  const base = imageBase(recs, h);
  for (const type of [201, 202]) {
    const offset = exthNumber(h, type);
    if (offset === NONE) continue;
    const data = recs[base + offset];
    const kind = imageType(data);
    if (data && kind) return { bytes: data, type: kind };
  }
  return null;
}

// ---- Reading -------------------------------------------------------------

function describe(h: Header) {
  const title = exthText(h, 503)[0] || h.fullName || "";
  const author = exthText(h, 100).join(", ");
  const lang = exthText(h, 524)[0];
  return { title, author, lang };
}

export function mobiInfo(
  bytes: Uint8Array,
): Omit<DocInfo, "cover"> & {
  coverBytes: Uint8Array | null;
  coverType: string;
} {
  const recs = records(bytes);
  const h = chooseHeader(recs);
  const d = describe(h);
  const c = cover(recs, h);
  return {
    format: "mobi",
    title: d.title,
    author: d.author,
    coverBytes: c?.bytes ?? null,
    coverType: c?.type ?? "",
  };
}

/** Byte offsets that filepos links point at get an anchor, so the links can find them. */
function anchorFilepos(raw: Uint8Array): Uint8Array {
  const latin = new TextDecoder("latin1").decode(raw);
  const targets = new Set<number>();
  for (const m of latin.matchAll(/filepos\s*=\s*["']?0*(\d+)/gi)) {
    const n = Number(m[1]);
    if (n < raw.length) targets.add(n);
  }
  if (!targets.size) return raw;
  const parts: Uint8Array[] = [];
  let from = 0;
  for (const at of [...targets].sort((a, b) => a - b)) {
    parts.push(
      raw.subarray(from, at),
      new TextEncoder().encode(`<a id="fp${at}"></a>`),
    );
    from = at;
  }
  parts.push(raw.subarray(from));
  return join(parts);
}

/** Splits HTML into sections at the given pattern, dropping empty ones. */
function split(html: string, at: RegExp): string[] {
  return html
    .split(at)
    .map((s) => s.trim())
    .filter((s) => s.replace(/<[^>]*>/g, "").trim() || /<img\b/i.test(s));
}

/** One section's body, from a chunk that may hold <html>, <head> and <body> tags. */
function bodyOf(chunk: string): string {
  const doc = new DOMParser().parseFromString(chunk, "text/html");
  return doc.body.innerHTML;
}

export function openMobi(bytes: Uint8Array): FlowDoc {
  const recs = records(bytes);
  const h = chooseHeader(recs);
  const d = describe(h);
  const kf8 = h.version >= 8;
  let raw = text(recs, h);

  // KF8: the first flow is the HTML; the others are stylesheets and SVG.
  if (kf8 && h.fdst !== NONE) {
    const fdst = recs[h.start + h.fdst];
    if (fdst && ascii(fdst, 0, 4) === "FDST" && u32(fdst, 8) > 0) {
      const entries = u32(fdst, 4);
      raw = raw.subarray(u32(fdst, entries), u32(fdst, entries + 4));
    }
  } else if (!kf8) raw = anchorFilepos(raw);
  const html = new TextDecoder(h.encoding).decode(raw);

  const base = imageBase(recs, h);
  const urls = new Map<number, string>();
  const urlFor = (index: number): string | null => {
    const data = recs[index];
    const type = imageType(data);
    if (!data || !type) return null;
    let url = urls.get(index);
    if (!url) {
      url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
      urls.set(index, url);
    }
    return url;
  };

  let chunks: string[];
  if (kf8) {
    // Each chapter starts at its skeleton's <html>; its fragments follow its </html>.
    // DOMPurify drops kindle: URLs before they can be resolved, so they become plain names first.
    const prepared = html.replace(
      /(["'])kindle:embed:([0-9a-v]+)(?:\?[^"']*)?\1/gi,
      (_, q: string, n: string) => `${q}embed-${parseInt(n, 32)}${q}`,
    );
    chunks = split(prepared, /(?=<html[\s>])/i).map(bodyOf);
  } else {
    const prepared = html
      .replace(/<head[\s>][\s\S]*?<\/head>/gi, "")
      .replace(
        /<img([^>]*?)\s(?:hi|lo)?recindex\s*=\s*["']?0*(\d+)["']?/gi,
        '<img$1 src="recindex-$2"',
      )
      .replace(/filepos\s*=\s*["']?0*(\d+)["']?/gi, 'href="fp-$1"');
    chunks = split(prepared, /<mbp:pagebreak\s*\/?>/i).map(bodyOf);
  }
  if (!chunks.length) throw new FormatError(t("error.mobiEmpty"));

  // Which section each filepos anchor ended up in.
  const anchors = new Map<string, number>();
  chunks.forEach((chunk, i) => {
    for (const m of chunk.matchAll(/id="fp(\d+)"/g)) anchors.set(m[1]!, i);
  });

  const sections: Section[] = [];
  const toc: TocEntry[] = [];
  chunks.forEach((chunk, i) => {
    const cleaned = clean(chunk, {
      resolveSrc: (src) => {
        const old = /^recindex-(\d+)$/.exec(src);
        if (old) return urlFor(base + Number(old[1]) - 1);
        const embed = /^embed-(\d+)$/.exec(src);
        if (embed) return urlFor(base + Number(embed[1]) - 1);
        return null;
      },
      resolveLink: (href) => {
        const fp = /^fp-(\d+)$/.exec(href);
        const at = fp ? anchors.get(fp[1]!) : undefined;
        return at === undefined ? null : `${at}#r-fp${fp![1]}`;
      },
    });
    const holder = document.createElement("template");
    holder.innerHTML = cleaned.html;
    const heading = (
      holder.content.querySelector("h1, h2, h3")?.textContent ?? ""
    )
      .replace(/\s+/g, " ")
      .trim();
    const title =
      heading ||
      (chunks.length > 1 ? t("mobi.part", { number: i + 1 }) : d.title);
    sections.push({ title, html: cleaned.html, text: cleaned.text });
    if (heading) toc.push({ label: heading, section: i, depth: 0 });
  });

  return {
    kind: "flow",
    sections,
    toc: toc.length
      ? toc
      : sections.map((s, i) => ({ label: s.title, section: i, depth: 0 })),
    lang: d.lang || undefined,
    dispose: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
  };
}
