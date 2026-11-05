// The bundled guide: a Markdown document added to the library on request.

import { addFiles } from '../state/intake';
import source from './guide.md?raw';

export const GUIDE_NAME = 'a-short-guide-to-rosetta.md';

export function addGuide(): Promise<void> {
  return addFiles([{ name: GUIDE_NAME, bytes: new TextEncoder().encode(source) }], { openSingle: true });
}
