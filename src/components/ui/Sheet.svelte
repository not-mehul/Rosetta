<script lang="ts">
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
  }

  let { title, onclose, children, footer, wide = false }: Props = $props();
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
  aria-labelledby={titleId}
  style:transform={drag ? `translateY(${drag}px)` : undefined}
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
  onclick={(e) => {
    if (e.target === dialog) onclose();
  }}
>
  <div class="sheet-grip" onpointerdown={start} onpointermove={move} onpointerup={end} onpointercancel={end} role="presentation">
    <div class="sheet-handle" aria-hidden="true"></div>
    <div class="sheet-head">
      <h2 class="sheet-title" id={titleId}>{title}</h2>
      <button type="button" class="btn btn-muted" onclick={onclose}>Close</button>
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
</style>
