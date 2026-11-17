// Text shared to Rosetta from another app (Android's share sheet): an article
// selection, an email, a passage. It's kept as a Markdown document, read in
// Rosetta's type and kept with its notes. Only the shared text is used:
// nothing is fetched, so a bare link stays a link.

import { registerPlugin } from '@capacitor/core';
import { platform } from './native';

interface SharedTextPlugin {
  addListener(event: 'shared', cb: (data: { text?: string; subject?: string }) => void): Promise<{ remove: () => Promise<void> }>;
}

const Native = registerPlugin<SharedTextPlugin>('SharedText');

/** Calls `onText` for text shared to Rosetta, including what was shared before the page loaded. */
export async function listenForSharedText(onText: (text: string, subject: string) => void): Promise<void> {
  if (platform !== 'android') return;
  await Native.addListener('shared', (data) => {
    if (data?.text) onText(data.text, data.subject ?? '');
  }).catch(() => undefined);
}

const URL_ONLY = /^\s*https?:\/\/\S+\s*$/i;

/**
 * A shared text as a document: its subject, or its first line, as the title,
 * and the text as Markdown. Null for a bare link, which has no words to keep.
 */
export function sharedDocument(text: string, subject: string, now = new Date()): { name: string; bytes: Uint8Array } | null {
  const body = text.replace(/\r\n?/g, '\n').trim();
  if (!body || URL_ONLY.test(body)) return null;
  const firstLine = body.split('\n')[0]!.trim();
  const title = (subject.trim() || (firstLine.length <= 80 ? firstLine : `${firstLine.slice(0, 77).replace(/\s+\S*$/, '')}…`)).replace(/^#+\s*/, '');
  // The first line is the title already: not twice.
  const rest = !subject.trim() && firstLine.length <= 80 ? body.split('\n').slice(1).join('\n').trim() : body;
  const md = `# ${title}\n\n${rest}\n`;
  const safe = title.replace(/[\\/:*?"<>|#…]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || `Shared ${now.toISOString().slice(0, 10)}`;
  return { name: `${safe}.md`, bytes: new TextEncoder().encode(md) };
}
