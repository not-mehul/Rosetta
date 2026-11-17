<script lang="ts">
  import { t } from '../../i18n/index.svelte';
  // style.md §8.11: rises from the bottom on phones, a modal from 900px up.
  // Swipe down on the handle or the header to dismiss.
  import type { Snippet } from 'svelte';
  import { ui } from '../../state/ui.svelte';

  interface Props {
    title: string;
    onclose: () => void;
    children: Snippet;
    /** Pinned under the body: the committing buttons. */
    footer?: Snippet;
    wide?: boolean;
    /** No dimming behind it, so what it changes stays in view (the reader's Aa panel). */
    peek?: boolean;
    /** The same height whatever it holds, so its tabs don't make it jump (Settings, the reader's sheets). */
    tall?: boolean;
    /** Icon buttons in the header, before Close. */
    actions?: Snippet;
  }

  let { title, onclose, children, footer, wide = false, peek = false, tall = false, actions }: Props = $props();
  let dialog: HTMLDialogElement;
  let dragFrom: number | null = null;
  let drag = $state(0);
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;

  $effect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const release = ui.pushOverlay(onclose);
    return () => {
      release();
      if (dialog.open) dialog.close();
      if (returnTo?.isConnected) returnTo.focus();
    };
  });

  function start(e: PointerEvent) {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    dragFrom = e.clientY;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (dragFrom !== null) drag = Math.max(0, e.clientY - dragFrom);
  }
  function end() {
    if (dragFrom === null) return;
    dragFrom = null;
    if (drag > 80) onclose();
    drag = 0;
  }
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  class:sheet-wide={wide}
  class:sheet-peek={peek}
  class:sheet-tall={tall}
  aria-labelledby={titleId}
  style:transform={drag ? `translateY(${drag}px)` : undefined}
  oncancel={(e) => {
    e.preventDefault();
    // Escape does what Android's Back does: the topmost thing first (a sheet may hold its own steps).
    ui.back();
  }}
  onclick={(e) => {
    if (e.target === dialog) onclose();
  }}
>
  <div class="sheet-grip" onpointerdown={start} onpointermove={move} onpointerup={end} onpointercancel={end} role="presentation">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 class="sheet-title" id={titleId}>{title}</h2>
      {#if actions}<div class="sheet-actions">{@render actions()}</div>{/if}
      <button type="button" class="btn btn-muted" onclick={onclose}>{t('action.close')}</button>
    </div>
  </div>
  <div class="sheet-body">
    {@render children()}
  </div>
  {#if footer}
    <div class="sheet-foot">{@render footer()}</div>
  {/if}
</dialog>

<style>
  .sheet-grip {
    touch-action: none;
  }

  /* At large text sizes the title and Close take a line each rather than run off the side. */
  .sheet-grip :global(.sheet-head) {
    flex-wrap: wrap;
  }
  .sheet-actions {
    display: flex;
    align-items: center;
    margin-left: auto;
  }
  .sheet-actions + .btn {
    margin-left: 0;
  }
  .sheet-foot {
    flex-shrink: 0;
    padding: var(--space-3) var(--space-5) calc(var(--space-3) + var(--inset-bottom));
    border-top: 1px solid var(--border-faint);
  }
</style>
