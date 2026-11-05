// The one door into the formats: what a file is, what it's called, and the
// readable document inside it. PDF and Word are loaded only when needed.

import { epubInfo, openEpub } from './epub';
import { htmlInfo, markdownInfo, openHtml, openMarkdown, openText } from './flow';
import { detectFormat, titleFromName } from './sniff';
import { FormatError, type DocInfo, type Format, type OpenDoc } from './types';

/** Scales an image down to a 240px-wide JPEG for the library card. */
export async function thumbnail(bytes: Uint8Array, type: string, width = 240): Promise<Uint8Array | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type }));
    const scale = Math.min(1, width / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/** Reads what the library shows for a file. Throws FormatError for files Rosetta can't read. */
export async function readInfo(bytes: Uint8Array, name: string): Promise<DocInfo> {
  const format = detectFormat(bytes, name);
  if (!format) throw new FormatError('Rosetta reads EPUB, PDF, Word (.docx), Markdown, HTML and plain text.');
  let info: DocInfo;
  switch (format) {
    case 'epub': {
      const { coverBytes, coverType, ...rest } = epubInfo(bytes);
      info = { ...rest, cover: coverBytes ? await thumbnail(coverBytes, coverType) : null };
      break;
    }
    case 'pdf':
      info = await (await import('./pdf')).pdfInfo(bytes);
      break;
    case 'docx':
      info = { ...(await import('./docx')).docxInfo(bytes), cover: null };
      break;
    case 'md':
      info = { ...markdownInfo(bytes), cover: null };
      break;
    case 'html':
      info = { ...htmlInfo(bytes), cover: null };
      break;
    default:
      info = { format, title: '', author: '', cover: null };
  }
  return { ...info, title: info.title || titleFromName(name) };
}

export async function openDocument(bytes: Uint8Array, format: Format): Promise<OpenDoc> {
  switch (format) {
    case 'epub':
      return openEpub(bytes);
    case 'pdf':
      return (await import('./pdf')).openPdf(bytes);
    case 'docx':
      return (await import('./docx')).openDocx(bytes);
    case 'md':
      return openMarkdown(bytes);
    case 'html':
      return openHtml(bytes);
    case 'txt':
      return openText(bytes);
  }
}

export { FormatError, type DocInfo, type Format, type OpenDoc };
