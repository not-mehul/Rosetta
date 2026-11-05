<script lang="ts">
  // style.md §8.10. A centred card on the native <dialog>, so focus trapping
  // and the inert background come for free.
  import type { Snippet } from 'svelte';
  import { ui } from '../../state/ui.svelte';

  interface Props {
    title: string;
    eyebrow?: string;
    closeLabel: string;
    onclose: () => void;
    children: Snippet;
  }

  let { title, eyebrow, closeLabel, onclose, children }: Props = $props();
  let dialog: HTMLDialogElement;

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
</script>

<dialog
  bind:this={dialog}
  class="modal-dialog"
  aria-labelledby="modal-title"
  onclick={(e) => {
    if (e.target === dialog) onclose();
  }}
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <div class="modal-card">
    <div class="modal-head">
      <div class="modal-head-text">
        {#if eyebrow}<p class="modal-eyebrow">{eyebrow}</p>{/if}
        <h2 class="modal-title" id="modal-title">{title}</h2>
      </div>
      <button type="button" class="btn-icon" aria-label={closeLabel} onclick={onclose}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    {@render children()}
  </div>
</dialog>
