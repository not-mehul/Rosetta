<script lang="ts">
  // Storage: the space each document takes, and offloading large ones while
  // keeping their place, marks and details.
  import { t } from '../../i18n/index.svelte';
  import { fileSize } from '../../lib/format';
  import { restoreFile } from '../../state/intake';
  import { library } from '../../state/library.svelte';
  import { ui } from '../../state/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const rows = $derived(library.items.map((doc) => ({ doc, bytes: doc.offloaded ? 0 : doc.size })).sort((a, b) => b.bytes - a.bytes));
  const total = $derived(rows.reduce((a, r) => a + r.bytes, 0));
  let estimate = $state<{ usage: number; quota: number } | null>(null);
  $effect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => (estimate = { usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => undefined);
  });

  async function offload(id: string) {
    await library.offload(id);
    ui.notify(t('details.offloaded'), 'success');
  }
</script>

<Sheet title={t('storage.title')} {onclose}>
  <p class="t-body-small dim" id="storageTotal">{t('storage.total', { size: fileSize(total), count: rows.filter((r) => r.bytes).length })}{estimate?.quota ? ` ${t('storage.device', { used: fileSize(estimate.usage), free: fileSize(Math.max(0, estimate.quota - estimate.usage)) })}` : ''}</p>
  <ul class="row-list">
    {#each rows as { doc, bytes } (doc.id)}
      <li class="row-with-action">
        <div class="row">
          <span class="row-main"><span class="row-title ellipsis">{doc.title}</span><span class="t-data-small faint">{doc.offloaded ? t('details.offloadedShort') : fileSize(bytes)}</span></span>
        </div>
        {#if doc.offloaded}
          <button type="button" class="btn-icon" aria-label={t('details.addFileAgain')} onclick={() => void restoreFile(doc.id)}><Icon name="download" /></button>
        {:else}
          <button type="button" class="btn-icon" aria-label={t('storage.offloadOne', { title: doc.title })} onclick={() => void offload(doc.id)}><Icon name="hard-drive" /></button>
        {/if}
      </li>
    {/each}
  </ul>
  <p class="t-hint"><em>{t('storage.noteTerm')}</em> {t('storage.note')}</p>
</Sheet>
