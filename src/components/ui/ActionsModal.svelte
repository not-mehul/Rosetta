<script lang="ts">
  // What a long press offers: the thing's name, then its actions as rows,
  // each an icon and a verb (style.md §8.10's modal).
  import { t } from '../../i18n/index.svelte';
  import { ui } from '../../state/ui.svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';
</script>

{#if ui.actionsRequest}
  {@const request = ui.actionsRequest}
  <Modal title={request.title} closeLabel={t('action.close')} onclose={() => request.resolve(null)}>
    <div class="action-list" role="group" aria-label={request.title}>
      {#each request.actions as a (a.id)}
        <button type="button" class="action-row" class:is-danger={a.danger} data-action={a.id} onclick={() => request.resolve(a.id)}>
          <Icon name={a.icon} />
          <span>{a.label}</span>
        </button>
      {/each}
    </div>
  </Modal>
{/if}

<style>
  .action-list {
    display: grid;
    gap: var(--space-1);
    margin-inline: calc(var(--space-2) * -1);
  }
  .action-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 48px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--corner-md);
    background: none;
    color: var(--text-heading);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .action-row:hover,
  .action-row:focus-visible {
    background: var(--hover-bg);
  }
  .action-row :global(svg) {
    flex: none;
    color: var(--accent-amber);
  }
  .action-row.is-danger,
  .action-row.is-danger :global(svg) {
    color: var(--danger);
  }
</style>
