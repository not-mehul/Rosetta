<script lang="ts">
  import { applyTheme } from './platform/theme.svelte';
  import { reader } from './state/reader.svelte';
  import { settings } from './state/settings.svelte';
  import { ui } from './state/ui.svelte';
  import { addFiles } from './state/intake';
  import LibraryView from './components/LibraryView.svelte';
  import ReaderView from './components/reader/ReaderView.svelte';
  import ContentsSheet from './components/sheets/ContentsSheet.svelte';
  import DetailsSheet from './components/sheets/DetailsSheet.svelte';
  import SearchSheet from './components/sheets/SearchSheet.svelte';
  import SettingsSheet from './components/sheets/SettingsSheet.svelte';
  import TypeSheet from './components/sheets/TypeSheet.svelte';
  import ConfirmModal from './components/ui/ConfirmModal.svelte';
  import Toast from './components/ui/Toast.svelte';

  let dropping = $state(false);

  $effect(() => applyTheme(settings.value.theme));

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
  <LibraryView />
{/if}

{#if dropping}
  <div class="drop-veil" aria-hidden="true"><p class="t-verdict">Drop to add to the library</p></div>
{/if}

{#if ui.overlay === 'settings'}
  <SettingsSheet onclose={close} />
{:else if ui.overlay === 'details' && ui.detailsId}
  <DetailsSheet id={ui.detailsId} onclose={close} />
{:else if ui.overlay === 'type'}
  <TypeSheet onclose={close} />
{:else if reader.content}
  {#if ui.overlay === 'contents'}
    <ContentsSheet onclose={close} />
  {:else if ui.overlay === 'search'}
    <SearchSheet onclose={close} />
  {/if}
{/if}

<ConfirmModal />

<Toast toast={ui.toast} onpause={() => ui.pauseToast()} onresume={() => ui.resumeToast()} onaction={() => ui.actOnToast()} />
