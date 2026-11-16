<script lang="ts">
  import { applyTheme } from './platform/theme.svelte';
  import { reader } from './state/reader.svelte';
  import { settings } from './state/settings.svelte';
  import { ui } from './state/ui.svelte';
  import { addFiles } from './state/intake';
  import IdleStone from './components/IdleStone.svelte';
  import Home from './components/Home.svelte';
  import IdleDock from './components/ui/IdleDock.svelte';
  import ReaderView from './components/reader/ReaderView.svelte';
  import ContentsSheet from './components/sheets/ContentsSheet.svelte';
  import DetailsSheet from './components/sheets/DetailsSheet.svelte';
  import EditSheet from './components/sheets/EditSheet.svelte';
  import SearchSheet from './components/sheets/SearchSheet.svelte';
  import SettingsSheet from './components/sheets/SettingsSheet.svelte';
  import StorageSheet from './components/sheets/StorageSheet.svelte';
  import ReadingPanel from './components/sheets/ReadingPanel.svelte';
  import ConfirmModal from './components/ui/ConfirmModal.svelte';
  import PromptModal from './components/ui/PromptModal.svelte';
  import { setLocale, t } from './i18n/index.svelte';
  import { Toast } from 'dusk-dawn';

  let dropping = $state(false);

  $effect(() => applyTheme(settings.value.theme, settings.value.oled));
  $effect(() => void setLocale(settings.value.locale));

  function close() {
    ui.close();
  }

  // Drop documents anywhere on the page.
  function dragover(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    dropping = true;
  }
  async function drop(e: DragEvent) {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    dropping = false;
    await addFiles([...e.dataTransfer.files], { openSingle: true });
  }
</script>

<svelte:window ondragover={dragover} ondragleave={(e) => e.relatedTarget === null && (dropping = false)} ondrop={(e) => void drop(e)} />

<div class="glow-layer" aria-hidden="true">
  <div class="glow glow-1"></div>
  <div class="glow glow-2"></div>
  <div class="glow glow-3"></div>
</div>

{#if reader.doc}
  <ReaderView />
{:else}
  <Home />
{/if}

{#if dropping}
  <div class="drop-veil" aria-hidden="true"><p class="t-verdict">{t('library.drop')}</p></div>
{/if}

{#if ui.overlay === 'settings'}
  <SettingsSheet onclose={close} />
{:else if ui.overlay === 'details' && ui.detailsId}
  <DetailsSheet id={ui.detailsId} onclose={close} />
{:else if ui.overlay === 'edit' && ui.detailsId}
  <EditSheet id={ui.detailsId} onclose={() => ui.open('details')} />
{:else if ui.overlay === 'storage'}
  <StorageSheet onclose={close} />
{:else if ui.overlay === 'type'}
  <ReadingPanel onclose={close} />
{:else if reader.content}
  {#if ui.overlay === 'contents'}
    <ContentsSheet onclose={close} />
  {:else if ui.overlay === 'search'}
    <SearchSheet onclose={close} />
  {/if}
{/if}

<IdleDock label={t('idle.label')} disabled={!!reader.doc || !!ui.overlay || ui.section !== 'library'}><IdleStone /></IdleDock>

<ConfirmModal />
<PromptModal />

<Toast toast={ui.toast} onpause={() => ui.pauseToast()} onresume={() => ui.resumeToast()} onaction={() => ui.actOnToast()} />

<style>
  /* Dropping a file on the page */
  .drop-veil {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: grid;
    place-items: center;
    background: var(--modal-backdrop);
    border: 2px dashed var(--accent-amber);
    pointer-events: none;
    animation: fade-in var(--dur-enter);
  }
</style>
