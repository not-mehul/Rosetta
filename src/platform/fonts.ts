// The reader's own font: a TTF, OTF, WOFF or WOFF2 file they add, kept in
// IndexedDB with the settings and registered as the "Rosetta Custom" face.
// The reading column uses it when the typeface setting is 'custom'.

import { db } from '../state/db';

export const CUSTOM_FAMILY = 'Rosetta Custom';
export const FONT_ACCEPT = '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/font-sfnt,application/x-font-ttf,application/x-font-otf';

interface StoredFont {
  id: 'customFont';
  value: { name: string; data: Blob };
}

const ROW = 'customFont' as const;
let loaded: FontFace | null = null;

/** A font's name for the settings: its file name without the extension, tidied. */
export function fontName(fileName: string): string {
  return (
    fileName
      .replace(/\.(ttf|otf|woff2?)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Custom'
  );
}

async function register(data: ArrayBuffer): Promise<void> {
  const face = new FontFace(CUSTOM_FAMILY, data, { style: 'normal', weight: '100 900' });
  await face.load();
  if (loaded) document.fonts.delete(loaded);
  document.fonts.add(face);
  loaded = face;
}

/** Registers the stored font, if there is one. Returns its name, or '' when none. */
export async function loadCustomFont(): Promise<string> {
  const row = (await db.settings.get(ROW as 'settings').catch(() => undefined)) as unknown as StoredFont | undefined;
  if (!row?.value?.data) return '';
  try {
    await register(await row.value.data.arrayBuffer());
    return row.value.name;
  } catch (err) {
    console.warn('The custom font could not be loaded:', err);
    return '';
  }
}

/** Checks, registers and keeps a font file. Throws when it isn't a font the browser can read. */
export async function saveCustomFont(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  await register(data);
  const name = fontName(file.name);
  const row: StoredFont = { id: ROW, value: { name, data: new Blob([data], { type: file.type || 'font/ttf' }) } };
  await db.settings.put(row as unknown as Parameters<typeof db.settings.put>[0]);
  return name;
}

export async function removeCustomFont(): Promise<void> {
  if (loaded) document.fonts.delete(loaded);
  loaded = null;
  await db.settings.delete(ROW as 'settings').catch(() => undefined);
}
