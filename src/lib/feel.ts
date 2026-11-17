// Touch you can feel (phones, when Haptics is on in Settings): the lightest
// selection tick as a tab, a switch or one of a set of choices changes. One
// listener for the whole app, like the icon motion. Accomplishments (a book
// finished, the day's goal, a streak) have their own, stronger tick where
// they happen.

import { selectTick } from '../platform/device';
import { settings } from '../state/settings.svelte';

const CHOICES = '[role="tab"], [role="switch"], [role="radio"]';

export function startFeel(root: Document = document): () => void {
  const onclick = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.(CHOICES);
    if (!el || el.matches(':disabled, [aria-disabled="true"]') || !settings.value.haptics) return;
    // A choice already made doesn't tick again.
    if (el.getAttribute('role') !== 'switch' && (el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true')) return;
    selectTick();
  };
  root.addEventListener('click', onclick, true);
  return () => root.removeEventListener('click', onclick, true);
}
