// Long press (press and hold) as a Svelte action. Holding still for HOLD_MS
// runs it once, with a selection tick; moving a finger's width or lifting
// early leaves the tap alone. The click that follows a hold is swallowed, so
// the hold never also chooses. The context-menu event (a right click, the
// keyboard's menu key, Shift+F10) runs it too, so it never depends on touch.
import { settings } from '../state/settings.svelte';
import { selectTick } from '../platform/device';

export const HOLD_MS = 500;
const SLOP = 10;

export function hold(node: HTMLElement, run: (node: HTMLElement) => void) {
  let act = run;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  let held = false;

  const fire = () => {
    held = true;
    node.classList.remove('is-holding');
    if (settings.value.haptics) selectTick();
    act(node);
  };
  const cancel = () => {
    clearTimeout(timer);
    start = null;
    node.classList.remove('is-holding');
  };
  const down = (e: PointerEvent) => {
    // A hold whose lift landed elsewhere (on the menu it opened) is over.
    held = false;
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    node.classList.add('is-holding');
    timer = setTimeout(fire, HOLD_MS);
  };
  const move = (e: PointerEvent) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) cancel();
  };
  const click = (e: MouseEvent) => {
    if (!held) return;
    held = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const menu = (e: MouseEvent) => {
    e.preventDefault();
    // A touch hold raises this too, once the timer has already run.
    if (held || start) return;
    fire();
    held = false;
  };

  // No text selection or callout while held (app.css, [data-hold]).
  node.dataset.hold = '';
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('click', click, true);
  node.addEventListener('contextmenu', menu);
  return {
    update(next: (node: HTMLElement) => void) {
      act = next;
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('pointerleave', cancel);
      node.removeEventListener('click', click, true);
      node.removeEventListener('contextmenu', menu);
    },
  };
}
