// Kindle books (MOBI, AZW3) built by hand: a Palm database with a MOBI
// header, EXTH metadata, text records and image records.
import { beforeAll, describe, expect, it } from "vitest";
import { FormatError, readInfo } from "../../src/formats";
import {
  mobiInfo,
  openMobi,
  palmDoc,
  withoutTrailing,
} from "../../src/formats/mobi";
import { detectFormat } from "../../src/formats/sniff";

const enc = (s: string) => new TextEncoder().encode(s);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

function u16(n: number) {
  return [(n >> 8) & 255, n & 255];
}
function u32(n: number) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function pdb(records: Uint8Array[]): Uint8Array {
  const head = 78 + records.length * 8 + 2;
  const out = new Uint8Array(head + records.reduce((n, r) => n + r.length, 0));
  out.set(enc("test-book"), 0);
  out.set(enc("BOOKMOBI"), 60);
  out.set(u16(records.length), 76);
  let at = head;
  records.forEach((r, i) => {
    out.set(u32(at), 78 + i * 8);
    out.set(r, at);
    at += r.length;
  });
  return out;
}

interface Rec0 {
  textLength: number;
  textRecords: number;
  compression?: number;
  encryption?: number;
  version?: number;
  firstImage?: number;
  extraFlags?: number;
  fdst?: number;
  exth?: [number, Uint8Array][];
}

function rec0(o: Rec0): Uint8Array {
  const r = new Uint8Array(1024);
  r.set(u16(o.compression ?? 1), 0);
  r.set(u32(o.textLength), 4);
  r.set(u16(o.textRecords), 8);
  r.set(u16(4096), 10);
  r.set(u16(o.encryption ?? 0), 12);
  r.set(enc("MOBI"), 16);
  r.set(u32(232), 20);
  r.set(u32(2), 24);
  r.set(u32(65001), 28);
  r.set(u32(o.version ?? 6), 0x24);
  r.set(u32(0xffffffff), 0x54);
  r.set(u32(o.firstImage ?? 0xffffffff), 0x6c);
  r.set(u32(0xffffffff), 0x70);
  r.set(u32(o.exth ? 0x40 : 0), 0x80);
  r.set(u32(o.fdst ?? 0xffffffff), 0xc0);
  r.set(u16(o.extraFlags ?? 0), 0xf2);
  if (o.exth) {
    const body = o.exth.flatMap(([type, data]) => [
      ...u32(type),
      ...u32(data.length + 8),
      ...data,
    ]);
    r.set(
      [
        ...enc("EXTH"),
        ...u32(body.length + 12),
        ...u32(o.exth.length),
        ...body,
      ],
      248,
    );
  }
  return r;
}

beforeAll(() => {
  // jsdom has no object URLs; the reader only needs a string back.
  let n = 0;
  URL.createObjectURL = () => `blob:mobi-${++n}`;
  URL.revokeObjectURL = () => undefined;
});

describe("MOBI decompression", () => {
  it("reads PalmDOC literals, back-references and space pairs", () => {
    // "abc", then 6 bytes from 3 back, then " A".
    expect(
      new TextDecoder().decode(
        palmDoc(new Uint8Array([0x61, 0x62, 0x63, 0x80, 0x1b, 0xc1])),
      ),
    ).toBe("abcabcabc A");
    // A run of 2 literal bytes that would otherwise be commands.
    expect([...palmDoc(new Uint8Array([2, 0x80, 0xc0]))]).toEqual([0x80, 0xc0]);
  });

  it("drops trailing entries and multibyte overlap from a text record", () => {
    // "Hello", one overlap byte and its size byte (flag bit 0), then a 3-byte trailing entry (flag bit 1).
    const record = new Uint8Array([
      ...enc("Hello"),
      0xaa,
      0x01,
      0x01,
      0x00,
      0x83,
    ]);
    expect(new TextDecoder().decode(withoutTrailing(record, 0b11))).toBe(
      "Hello",
    );
  });
});

describe("MOBI books", () => {
  function oldBook(encryption = 0) {
    const page2 =
      "<h2>Second</h2><p>Back to <a filepos=0000000000>the start</a>.</p>";
    const html = `<html><head><guide></guide></head><body><h1>First</h1><p>Hello <img recindex="00001"> there.</p><mbp:pagebreak/>${page2}</body></html>`;
    const bytes = enc(html);
    const half = Math.floor(bytes.length / 2);
    // Two text records, each with a one-byte trailing entry (flag bit 1).
    const t1 = new Uint8Array([...bytes.subarray(0, half), 0x81]);
    const t2 = new Uint8Array([...bytes.subarray(half), 0x81]);
    return pdb([
      rec0({
        textLength: bytes.length,
        textRecords: 2,
        encryption,
        firstImage: 3,
        extraFlags: 0b10,
        exth: [
          [100, enc("Ada Lovelace")],
          [503, enc("The Engine")],
          [524, enc("en")],
          [201, new Uint8Array(u32(0))],
        ],
      }),
      t1,
      t2,
      PNG,
    ]);
  }

  it("is recognised by its header, whatever it is called", () => {
    expect(detectFormat(oldBook(), "content")).toBe("mobi");
  });

  it("reads the title, author and cover", () => {
    const info = mobiInfo(oldBook());
    expect(info).toMatchObject({
      format: "mobi",
      title: "The Engine",
      author: "Ada Lovelace",
      coverType: "image/png",
    });
    expect(info.coverBytes?.length).toBe(PNG.length);
  });

  it("splits at page breaks, keeps images and resolves filepos links", () => {
    const doc = openMobi(oldBook());
    expect(doc.sections.map((s) => s.title)).toEqual(["First", "Second"]);
    expect(doc.toc.map((e) => e.label)).toEqual(["First", "Second"]);
    expect(doc.lang).toBe("en");
    expect(doc.sections[0]!.html).toMatch(/<img[^>]+src="blob:mobi-/);
    expect(doc.sections[0]!.html).toContain('id="r-fp0"');
    expect(doc.sections[1]!.html).toContain('data-link="0#r-fp0"');
    expect(doc.sections[1]!.text).toContain("Back to the start.");
  });

  it("refuses a book with DRM, saying why", async () => {
    expect(() => openMobi(oldBook(2))).toThrow(FormatError);
    await expect(readInfo(oldBook(2), "locked.azw")).rejects.toThrow(/DRM/);
  });

  it("reads a KF8 (AZW3) book chapter by chapter, without its stylesheets", () => {
    const flow0 =
      '<html><head><title>x</title></head><body aid="0"></body></html><p>One <img src="kindle:embed:0001?mime=image/png"></p>' +
      '<html><head></head><body aid="1"></body></html><h1>Two</h1><p>More.</p>';
    const css = "p { color: red }";
    const text = enc(flow0 + css);
    const flow = enc(flow0).length;
    const fdst = new Uint8Array([
      ...enc("FDST"),
      ...u32(12),
      ...u32(2),
      ...u32(0),
      ...u32(flow),
      ...u32(flow),
      ...u32(text.length),
    ]);
    const doc = openMobi(
      pdb([
        rec0({
          textLength: text.length,
          textRecords: 1,
          version: 8,
          firstImage: 2,
          fdst: 3,
          exth: [[503, enc("Kay Eight")]],
        }),
        text,
        PNG,
        fdst,
      ]),
    );
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0]!.html).toMatch(/src="blob:mobi-/);
    expect(doc.sections[1]!.title).toBe("Two");
    expect(doc.sections.map((s) => s.text).join(" ")).not.toContain("color");
  });
});
