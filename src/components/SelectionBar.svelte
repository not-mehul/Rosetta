<script lang="ts">
  // What can be done to the books chosen (selection.svelte.ts), in the add
  // button's place at the foot of the library: how many, then mark finished,
  // mark not started, add to a collection, remove, and choose all. The cross
  // (or Back) stops choosing.
  import { fly } from 'svelte/transition';
  import { t } from '../i18n/index.svelte';
  import { selection } from '../state/selection.svelte';
  import { ui } from '../state/ui.svelte';
  import Icon from './ui/Icon.svelte';

  let { shown }: { shown: readonly string[] } = $props();
  const allChosen = $derived(shown.length > 0 && shown.every((id) => selection.has(id)));

  // Back, Escape and leaving the library stop choosing.
  $effect(() => {
    const release = ui.pushOverlay(() => selection.clear());
    return () => {
      release();
      selection.clear();
    };
  });
</script>

<div class="selection-bar panel" role="toolbar" aria-label={t('select.toolbar')} id="selectionBar" transition:fly={{ y: 24, duration: 240 }}>
  <button type="button" class="btn-icon" id="stopSelecting" aria-label={t('select.stop')} onclick={() => selection.clear()}><Icon name="x" /></button>
  <!-- The figure alone on screen, so the actions fit one row on a phone; the words for a screen reader. -->
  <span class="selection-count" role="status" aria-live="polite"><span class="t-data tabular amber" aria-hidden="true">{selection.ids.size}</span><span class="visually-hidden">{t('select.count', { count: selection.ids.size })}</span></span>
  <div class="selection-actions">
    <button type="button" class="btn-icon" id="selectAll" aria-label={allChosen ? t('select.none') : t('select.all')} aria-pressed={allChosen} onclick={() => selection.all(shown)}><Icon name="list-checks" /></button>
    <button type="button" class="btn-icon" id="selectFinish" aria-label={t('details.markFinished')} onclick={() => void selection.finish()}><Icon name="check" /></button>
    <button type="button" class="btn-icon" id="selectReset" aria-label={t('select.markUnread')} onclick={() => void selection.reset()}><Icon name="rotate-ccw" /></button>
    <button type="button" class="btn-icon" id="selectCollect" aria-label={t('select.toCollection')} onclick={() => void selection.collect()}><Icon name="folder-plus" /></button>
    <button type="button" class="btn-icon selection-remove" id="selectRemove" aria-label={t('action.remove')} onclick={() => void selection.remove()}><Icon name="trash-2" /></button>
  </div>
</div>

<style>
  .selection-bar {
    position: fixed;
    left: calc(var(--space-4) + var(--inset-left));
    right: calc(var(--space-4) + var(--inset-right));
    bottom: calc(var(--space-4) + var(--inset-bottom));
    z-index: 50;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    max-width: 640px;
    margin-inline: auto;
    padding: var(--space-1) var(--space-2);
    background: var(--modal-bg);
    border: 1px solid var(--border);
    border-radius: var(--corner-xl);
    box-shadow:
      0 0 40px rgba(var(--accent-amber-rgb), 0.18),
      0 8px 24px rgba(var(--shadow-rgb), calc(0.4 * var(--shadow-strength)));
  }
  /* The count keeps to one line; at large text the actions take a row of their own. */
  .selection-count {
    flex: 1 0 auto;
    white-space: nowrap;
  }
  .selection-count .t-data {
    font-size: 1.25rem;
  }
  .selection-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-1);
    margin-left: auto;
  }
  .selection-remove {
    color: var(--danger);
  }
  /* While the bar is up, a toast (the Undo) sits above it. */
  :global(html body:has(.selection-bar)) {
    --toast-lift: 72px;
  }
  /* And the last books scroll clear of it. */
  :global(html body:has(.selection-bar) #shelf) {
    padding-bottom: 96px;
  }
</style>
