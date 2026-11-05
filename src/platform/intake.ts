// Files opened from elsewhere: "Open with Rosetta" on Android (VIEW intents for
// the formats Rosetta reads) and the document types on iOS. Both arrive as
// appUrlOpen with a content:// or file:// URL that the Filesystem plugin can read.

import { App } from '@capacitor/app';
import { Filesystem } from '@capacitor/filesystem';
import { base64ToBytes } from '../lib/base64';
import { isNative } from './native';

export interface Incoming {
  name: string;
  bytes: Uint8Array;
}

/** The last path segment; Android content URIs often end in an opaque id, which the format sniffer copes with. */
export function nameFrom(url: string): string {
  return decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() ?? '') || 'Opened document';
}

async function read(url: string): Promise<Incoming | null> {
  if (!/^(content|file):/i.test(url)) return null;
  const { data } = await Filesystem.readFile({ path: url });
  const bytes = typeof data === 'string' ? base64ToBytes(data) : new Uint8Array(await data.arrayBuffer());
  return { name: nameFrom(url), bytes };
}

/** Calls `onOpen` for the file the app was launched with, and for each one after. */
export async function listenForFiles(onOpen: (file: Incoming) => void, onError: (err: unknown) => void): Promise<void> {
  if (!isNative) return;
  const handle = (url: string | undefined) => {
    if (!url) return;
    read(url)
      .then((file) => file && onOpen(file))
      .catch(onError);
  };
  await App.addListener('appUrlOpen', (event) => handle(event.url));
  const launch = await App.getLaunchUrl().catch(() => undefined);
  handle(launch?.url);
}
