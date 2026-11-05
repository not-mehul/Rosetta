// PDF through pdf.js (the legacy build, for older Android WebViews). The worker,
// CMaps, standard fonts and decoders are bundled with the app, so a PDF opens
// with the radio off. Pages render to a canvas with a text layer over it, which
// is what selection, highlights and search work on.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { FormatError, type DocInfo, type PdfDoc, type TocEntry } from './types';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

async function load(bytes: Uint8Array): Promise<{ pdf: PDFDocumentProxy; destroy: () => void }> {
  // pdf.js hands the buffer to its worker, so give it a copy.
  const task = pdfjs.getDocument({
      data: bytes.slice(),
      cMapUrl: `${ASSETS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`,
      iccUrl: `${ASSETS}iccs/`,
    });
  try {
    return { pdf: await task.promise, destroy: () => void task.destroy() };
  } catch (err) {
    void task.destroy();
    if ((err as { name?: string })?.name === 'PasswordException') throw new FormatError('This PDF is protected by a password, which Rosetta can’t open yet.');
    throw new FormatError(`This PDF couldn’t be read (${err instanceof Error ? err.message : String(err)}).`);
  }
}

const pageText = (items: unknown[]) => items.map((i) => (i as { str?: string }).str ?? '').join('');

async function outline(pdf: PDFDocumentProxy): Promise<TocEntry[]> {
  const items = await pdf.getOutline().catch(() => null);
  if (!items) return [];
  const out: TocEntry[] = [];
  const walk = async (list: typeof items, depth: number) => {
    for (const item of list) {
      try {
        const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest;
        const ref = dest?.[0];
        const section = typeof ref === 'number' ? ref : ref ? await pdf.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]) : -1;
        if (section >= 0 && item.title.trim()) out.push({ label: item.title.replace(/\s+/g, ' ').trim(), section, depth });
      } catch {
        // An outline entry pointing nowhere is skipped.
      }
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  };
  await walk(items, 0);
  return out;
}

export async function openPdf(bytes: Uint8Array): Promise<PdfDoc> {
  const { pdf, destroy } = await load(bytes);
  const pages = new Map<number, Promise<PDFPageProxy>>();
  const page = (i: number) => {
    let p = pages.get(i);
    if (!p) pages.set(i, (p = pdf.getPage(i + 1)));
    return p;
  };
  // Page sizes up front, so the scroll height is right before anything renders.
  const sizes = await Promise.all(
    Array.from({ length: pdf.numPages }, async (_, i) => {
      const vp = (await page(i)).getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    }),
  );
  const texts = new Map<number, Promise<string>>();
  const renders = new Map<HTMLCanvasElement, { cancel: () => void }>();

  return {
    kind: 'pdf',
    pageCount: pdf.numPages,
    sizes,
    toc: await outline(pdf),
    pageText: (i) => {
      let t = texts.get(i);
      if (!t) texts.set(i, (t = page(i).then(async (p) => pageText((await p.getTextContent()).items))));
      return t;
    },
    renderPage: async (i, canvas, textLayer, cssWidth) => {
      renders.get(canvas)?.cancel();
      const p = await page(i);
      const scale = cssWidth / sizes[i]!.width;
      const viewport = p.getViewport({ scale });
      const ratio = Math.min(globalThis.devicePixelRatio || 1, 3);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      const task = p.render({ canvas, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      renders.set(canvas, task);
      textLayer.replaceChildren();
      textLayer.style.setProperty('--total-scale-factor', String(scale));
      const layer = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: textLayer, viewport });
      try {
        await Promise.all([task.promise, layer.render()]);
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') throw err;
      } finally {
        if (renders.get(canvas) === task) renders.delete(canvas);
      }
    },
    dispose: destroy,
  };
}

/** Title, author and a thumbnail of the first page. */
export async function pdfInfo(bytes: Uint8Array): Promise<DocInfo> {
  const { pdf, destroy } = await load(bytes);
  try {
    const meta = await pdf.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as { Title?: string; Author?: string };
    let cover: Uint8Array | null = null;
    try {
      const p = await pdf.getPage(1);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: 240 / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await p.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      cover = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    } catch {
      // No thumbnail; the card shows its placeholder.
    }
    return { format: 'pdf', title: (meta?.metadata?.get('dc:title') as string | undefined) || info.Title?.trim() || '', author: info.Author?.trim() ?? '', cover };
  } finally {
    destroy();
  }
}
