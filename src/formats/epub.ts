// EPUB 2 and 3: the container, the package (metadata, manifest, spine), the
// table of contents (nav or NCX) and the content documents, read into a flow
// document. Images become object URLs, released by dispose().

import { strFromU8, unzipSync } from 'fflate';
import { clean } from './sanitize';
import { FormatError, type DocInfo, type FlowDoc, type Section, type TocEntry } from './types';

type Files = Map<string, Uint8Array>;

const decode = (b: Uint8Array | undefined) => (b ? strFromU8(b).replace(/^\uFEFF/, '') : '');

function unzip(bytes: Uint8Array): Files {
  try {
    const files: Files = new Map();
    for (const [path, data] of Object.entries(unzipSync(bytes))) if (!path.endsWith('/')) files.set(path, data);
    return files;
  } catch {
    throw new FormatError('This EPUB is damaged: it is not a readable zip archive.');
  }
}

function parseXml(source: string): Document {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('not well-formed');
  return doc;
}

/** XHTML, or HTML when a book's chapter isn't well-formed XML. */
function parseContent(source: string): Document {
  try {
    return parseXml(source);
  } catch {
    return new DOMParser().parseFromString(source, 'text/html');
  }
}

const byLocal = (root: Document | Element, name: string) => [...root.getElementsByTagNameNS('*', name)];
const first = (root: Document | Element, name: string) => byLocal(root, name)[0];
const squash = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

/** Resolves `href` against the folder `base` ("OEBPS/text/"), dropping any fragment. */
export function resolvePath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]!.split('?')[0]!);
  const parts = (clean.startsWith('/') ? clean.slice(1) : base + clean).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

interface Package {
  files: Files;
  opfDir: string;
  title: string;
  author: string;
  manifest: Map<string, { path: string; type: string; props: string[] }>;
  spine: string[];
  coverPath: string | null;
  navPath: string | null;
  ncxPath: string | null;
}

function readPackage(bytes: Uint8Array): Package {
  const files = unzip(bytes);
  let opfPath = '';
  try {
    opfPath = first(parseXml(decode(files.get('META-INF/container.xml'))), 'rootfile')?.getAttribute('full-path') ?? '';
  } catch {
    // Fall back to any package document below.
  }
  if (!files.has(opfPath)) opfPath = [...files.keys()].find((p) => p.toLowerCase().endsWith('.opf')) ?? '';
  if (!opfPath) throw new FormatError('This EPUB has no package document, so its chapters can’t be found.');
  let opf: Document;
  try {
    opf = parseXml(decode(files.get(opfPath)));
  } catch {
    throw new FormatError('This EPUB’s package document is damaged.');
  }
  const opfDir = dirname(opfPath);

  const manifest = new Map<string, { path: string; type: string; props: string[] }>();
  for (const item of byLocal(opf, 'item')) {
    manifest.set(item.getAttribute('id') ?? '', {
      path: resolvePath(opfDir, item.getAttribute('href') ?? ''),
      type: item.getAttribute('media-type') ?? '',
      props: (item.getAttribute('properties') ?? '').split(/\s+/),
    });
  }
  const spineEl = first(opf, 'spine');
  const spine = byLocal(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') !== 'no')
    .map((r) => manifest.get(r.getAttribute('idref') ?? '')?.path)
    .filter((p): p is string => !!p && files.has(p));

  const items = [...manifest.values()];
  const metaCover = byLocal(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content');
  const coverPath =
    items.find((i) => i.props.includes('cover-image'))?.path ??
    (metaCover ? manifest.get(metaCover)?.path : undefined) ??
    items.find((i) => i.type.startsWith('image/') && /cover/i.test(i.path))?.path;

  const creators = byLocal(opf, 'creator').map((c) => squash(c.textContent)).filter(Boolean);
  return {
    files,
    opfDir,
    title: squash(first(opf, 'title')?.textContent),
    author: creators.join(', '),
    manifest,
    spine,
    coverPath: coverPath && files.has(coverPath) ? coverPath : null,
    navPath: items.find((i) => i.props.includes('nav'))?.path ?? null,
    ncxPath: (spineEl?.getAttribute('toc') && manifest.get(spineEl.getAttribute('toc')!)?.path) || items.find((i) => i.type === 'application/x-dtbncx+xml')?.path || null,
  };
}

const IMAGE_TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };
export const imageType = (path: string) => IMAGE_TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

export function epubInfo(bytes: Uint8Array): Omit<DocInfo, 'cover'> & { coverBytes: Uint8Array | null; coverType: string } {
  const pkg = readPackage(bytes);
  return {
    format: 'epub',
    title: pkg.title,
    author: pkg.author,
    coverBytes: pkg.coverPath ? pkg.files.get(pkg.coverPath)! : null,
    coverType: pkg.coverPath ? imageType(pkg.coverPath) : '',
  };
}

export function openEpub(bytes: Uint8Array): FlowDoc {
  const pkg = readPackage(bytes);
  if (!pkg.spine.length) throw new FormatError('This EPUB’s reading order is empty.');
  const urls = new Map<string, string>();
  const index = new Map(pkg.spine.map((p, i) => [p, i]));

  const sections: Section[] = pkg.spine.map((path) => {
    const doc = parseContent(decode(pkg.files.get(path)));
    const body = (doc.getElementsByTagName('body')[0] ?? doc.documentElement) as Element;
    // Serialise as HTML, not XML, so <a/> and friends parse the same way back.
    const holder = document.implementation.createHTMLDocument('');
    for (const node of [...body.childNodes]) holder.body.appendChild(holder.importNode(node, true));
    const base = dirname(path);
    const cleaned = clean(holder.body.innerHTML, {
      resolveSrc: (src) => {
        const target = resolvePath(base, src);
        const data = pkg.files.get(target);
        if (!data) return null;
        let url = urls.get(target);
        if (!url) {
          url = URL.createObjectURL(new Blob([data as BlobPart], { type: imageType(target) }));
          urls.set(target, url);
        }
        return url;
      },
      resolveLink: (href) => {
        const target = resolvePath(base, href);
        const at = index.get(target);
        if (at === undefined) return null;
        const frag = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
        return frag ? `${at}#r-${decodeURIComponent(frag)}` : String(at);
      },
    });
    const heading = holder.querySelector('h1, h2, h3') ?? doc.getElementsByTagName('title')[0];
    return { title: squash(heading?.textContent), html: cleaned.html, text: cleaned.text, path };
  });

  const toc = readToc(pkg, index);
  return {
    kind: 'flow',
    sections,
    toc: toc.length ? toc : sections.map((s, i) => ({ label: s.title || `Section ${i + 1}`, section: i, depth: 0 })).filter((e) => sections[e.section]!.text.trim()),
    dispose: () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
  };
}

function tocTarget(base: string, href: string, index: Map<string, number>): Pick<TocEntry, 'section' | 'anchor'> | null {
  const section = index.get(resolvePath(base, href));
  if (section === undefined) return null;
  const frag = href.includes('#') ? decodeURIComponent(href.slice(href.indexOf('#') + 1)) : '';
  return { section, anchor: frag ? `r-${frag}` : undefined };
}

function readToc(pkg: Package, index: Map<string, number>): TocEntry[] {
  const out: TocEntry[] = [];
  if (pkg.navPath && pkg.files.has(pkg.navPath)) {
    const doc = parseContent(decode(pkg.files.get(pkg.navPath)));
    const nav = byLocal(doc, 'nav').find((n) => (n.getAttribute('epub:type') ?? n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? '').includes('toc')) ?? first(doc, 'nav');
    const base = dirname(pkg.navPath);
    const walk = (list: Element, depth: number) => {
      for (const li of [...list.children].filter((c) => c.localName === 'li')) {
        const a = [...li.children].find((c) => c.localName === 'a' || c.localName === 'span');
        const target = a?.getAttribute('href') ? tocTarget(base, a.getAttribute('href')!, index) : null;
        const label = squash(a?.textContent);
        if (target && label) out.push({ label, depth, ...target });
        const sub = [...li.children].find((c) => c.localName === 'ol' || c.localName === 'ul');
        if (sub) walk(sub, target ? depth + 1 : depth);
      }
    };
    const list = nav && [...nav.children].find((c) => c.localName === 'ol' || c.localName === 'ul');
    if (list) walk(list, 0);
    if (out.length) return out;
  }
  if (pkg.ncxPath && pkg.files.has(pkg.ncxPath)) {
    try {
      const doc = parseXml(decode(pkg.files.get(pkg.ncxPath)));
      const base = dirname(pkg.ncxPath);
      const walk = (parent: Element, depth: number) => {
        for (const point of [...parent.children].filter((c) => c.localName === 'navPoint')) {
          const label = squash(first(point, 'text')?.textContent);
          const src = first(point, 'content')?.getAttribute('src');
          const target = src ? tocTarget(base, src, index) : null;
          if (target && label) out.push({ label, depth, ...target });
          walk(point, depth + 1);
        }
      };
      const map = first(doc, 'navMap');
      if (map) walk(map, 0);
    } catch {
      // A damaged NCX: the spine stands in for the contents.
    }
  }
  return out;
}
