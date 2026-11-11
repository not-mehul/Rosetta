// Rosetta's moments of delight and its easter eggs (style.md §11.3). The
// animations come from dusk-dawn and all of them respect reduced motion; the
// toast always says what happened, so nothing is only visual.

import { celebrate, createEggs, type CelebrateOptions } from 'dusk-dawn/expressive';
import { t } from '../i18n/index.svelte';
import { ui } from '../state/ui.svelte';

export const EGGS = ['konami', 'title', 'answer'] as const;
export type Egg = (typeof EGGS)[number];

const eggs = createEggs('rosetta', EGGS);

/** Confetti from a type case: pilcrows, section marks, ampersands and fleurons. */
export const TYPE_CASE: CelebrateOptions = {
  glyphs: ['¶', '§', '&', '❦', '†', 'a', 'Ω'],
  shapes: ['circle', 'diamond', 'clover-4', 'cookie-4'],
  colours: ['--accent-bright', '--accent-amber', '--accent-sage', '--text-heading'],
};

/** An easter egg hatches: its toast, with the count the first time it's found. */
export function hatch(id: Egg, message: string): void {
  const { isNew, found, total } = eggs.find(id);
  ui.notify(isNew ? `${message} ${t('egg.found', { found, total })}` : message, 'celebrate');
}

export function eggsFound(): number {
  return eggs.found().length;
}

/** A real accomplishment: confetti, from where it happened. */
export function cheer(origin?: Element | null, options: CelebrateOptions = {}): void {
  void celebrate({ ...TYPE_CASE, origin: origin ?? undefined, ...options });
}
