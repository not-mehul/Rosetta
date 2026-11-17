<script lang="ts">
  // The reader's Aa panel, see-through so the page above it shows each change
  // as it's made. Four tabs, each holding only what applies to the document
  // open (a PDF has no typeface; a comic doesn't read aloud):
  //   Text    typeface, size, line spacing, justified lines, the book's original style
  //   Page    scroll, pages or Flow, and keeping the screen on; a PDF's view, fit and zoom
  //   Light   true black and night light
  //   Listen  read aloud, its speed and voice
  // A book keeps changes to its text and page for itself; the icon in the
  // header puts it back on the defaults (set in Settings → Reading).
  import { IconTabs, Switch } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import { autoScroll } from '../../state/autoscroll.svelte';
  import { reader } from '../../state/reader.svelte';
  import type { Settings } from '../../state/settings';
  import { speech } from '../../state/speech.svelte';
  import { ui, type PanelTab } from '../../state/ui.svelte';
  import LightControls from '../controls/LightControls.svelte';
  import ListenControls from '../controls/ListenControls.svelte';
  import PageControls from '../controls/PageControls.svelte';
  import TextControls from '../controls/TextControls.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import type { Snippet } from 'svelte';

  let { onclose }: { onclose: () => void } = $props();
  const v = $derived(reader.view);
  const set = (patch: Partial<Settings>) => void reader.adjust(patch);

  const c = $derived(reader.content);
  /** Reflowing text: everything a typeface and a column apply to. */
  const text = $derived(c?.kind === 'flow' && !c.pictures && !c.fixed);
  const pdf = $derived(c?.kind === 'pdf');
  const fixed = $derived(c?.kind === 'flow' && !!c.fixed);
  const pictures = $derived(c?.kind === 'flow' && !!c.pictures);
  const bookStyles = $derived(c?.kind === 'flow' && !!c.css);
  const canListen = $derived(!!c && !pictures && !fixed);

  // Icons that share the row evenly, as in Settings; only the open tab shows its word.
  const tabs = $derived(
    [
      text && { id: 'text' as const, label: t('panel.text'), icon: textIcon, domId: 'panel-text', controls: 'panelBody' },
      { id: 'page' as const, label: t('panel.page'), icon: pageIcon, domId: 'panel-page', controls: 'panelBody' },
      { id: 'light' as const, label: t('panel.light'), icon: lightIcon, domId: 'panel-light', controls: 'panelBody' },
      canListen && { id: 'listen' as const, label: t('panel.listen'), icon: listenIcon, domId: 'panel-listen', controls: 'panelBody' },
    ].filter((x): x is { id: PanelTab; label: string; icon: Snippet; domId: string; controls: string } => !!x),
  );
  /** The tab last used, if it applies here; otherwise the first. */
  const tab = $derived(tabs.some((x) => x.id === ui.panelTab) ? ui.panelTab : tabs[0]!.id);
  /** Which side a tab's controls slide in from: the side its tab is on. */
  let from = $state(0);
  function choose(id: PanelTab) {
    from = Math.sign(tabs.findIndex((x) => x.id === id) - tabs.findIndex((x) => x.id === tab));
    ui.panelTab = id;
  }

  /** Starts (or stops) reading aloud; starting closes the panel so the page and its controls show. */
  function readAloud() {
    if (speech.active) {
      speech.stop();
      return;
    }
    onclose();
    void speech.start();
  }

  function startAutoScroll() {
    onclose();
    autoScroll.start();
  }
</script>

{#snippet textIcon()}<Icon name="type" />{/snippet}
{#snippet pageIcon()}<Icon name="book-text" />{/snippet}
{#snippet lightIcon()}<Icon name="sun-moon" />{/snippet}
{#snippet listenIcon()}<Icon name="headphones" />{/snippet}

{#snippet revert()}
  {#if reader.ownView}
    <button type="button" class="btn-icon" id="useDefaults" aria-label={t('panel.useDefaults')} title={t('panel.useDefaults')} onclick={() => void reader.useDefaults()}><Icon name="rotate-ccw" /></button>
  {/if}
{/snippet}

<Sheet title={t('reader.type')} {onclose} peek tall actions={revert}>
  <div class="panel-tabs sheet-icon-tabs">
    <IconTabs {tabs} value={tab} label={t('panel.label')} onselect={choose} />
  </div>

  {#key tab}
  <div class="panel-body axis-stage axis-small" style:--from={from} id="panelBody" role="tabpanel" aria-labelledby="panel-{tab}">
    {#if tab === 'text'}
      <TextControls {v} {set} {bookStyles} />
    {:else if tab === 'page'}
      {#if reader.doc?.format === 'pdf'}
        <div class="field">
          <span class="t-field-label" id="pdfViewLabel">{t('type.pdfView')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="pdfViewLabel">
            <button type="button" role="radio" id="pdfPages" aria-checked={!c || c.kind === 'pdf'} disabled={reader.loading} onclick={() => set({ pdfView: 'pages' })}>{t('type.pdfPages')}</button>
            <button type="button" role="radio" id="pdfText" aria-checked={c?.kind === 'flow'} disabled={reader.loading} onclick={() => set({ pdfView: 'text' })}>{t('type.pdfText')}</button>
          </div>
          <span class="field-hint">{t('type.pdfViewHint')}</span>
        </div>
      {/if}
      {#if pdf}
        <div class="field">
          <span class="t-field-label" id="fitLabel">{t('type.pdfFit')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="fitLabel">
            <button type="button" role="radio" id="fitWidth" aria-checked={v.pdfFit === 'width'} onclick={() => set({ pdfFit: 'width', pdfZoom: 1 })}>{t('type.fitWidth')}</button>
            <button type="button" role="radio" id="fitPage" aria-checked={v.pdfFit === 'page'} onclick={() => set({ pdfFit: 'page', pdfZoom: 1 })}>{t('type.fitPage')}</button>
          </div>
        </div>
        <div class="field">
          <span class="t-field-label" id="zoomLabel">{t('type.pdfZoom')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="zoomLabel">
            {#each [1, 1.5, 2, 3] as const as z (z)}
              <button type="button" role="radio" aria-checked={Math.abs(v.pdfZoom - z) < 0.01} onclick={() => set({ pdfZoom: z })}>{z === 1 ? t('type.fit') : `${z * 100}%`}</button>
            {/each}
          </div>
          <span class="field-hint">{t('type.pdfZoomHint', { zoom: Math.round(v.pdfZoom * 100) })}</span>
        </div>
        <div class="settings-list">
          <Switch checked={v.pageTone === 'theme'} label={t('type.duskPages')} hint={t('type.duskPagesHint')} onchange={(on) => set({ pageTone: on ? 'theme' : 'original' })} />
        </div>
      {/if}
      {#if !pdf && !fixed}
        <PageControls {v} {set} {pictures} onautoscroll={text ? startAutoScroll : undefined} />
      {:else}
        <div class="settings-list">
          <Switch checked={v.keepAwake} label={t('type.keepAwake')} hint={t('type.keepAwakeHint')} onchange={(on) => set({ keepAwake: on })} />
        </div>
      {/if}
    {:else if tab === 'light'}
      <LightControls {v} {set} />
    {:else}
      <div class="listen-start">
        <button type="button" class="btn {speech.active ? 'btn-secondary' : 'btn-primary'}" id="readAloud" aria-pressed={speech.active} onclick={readAloud}><Icon name="volume-2" />{speech.active ? t('speech.stop') : t('speech.start')}</button>
        <span class="field-hint">{t('panel.listenHint')}</span>
      </div>
      <ListenControls {v} {set} />
    {/if}
    {#if (tab === 'text' || tab === 'page') && reader.ownView}
      <p class="t-hint own-hint">{t('panel.ownHint')}</p>
    {/if}
  </div>
  {/key}
</Sheet>

<style>
  .panel-tabs {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0 calc(-1 * var(--space-5)) var(--space-4);
    padding: 0 var(--space-5);
    background: var(--sheet-bg);
  }
  .listen-start {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .own-hint {
    padding-top: var(--space-3);
    border-top: 1px solid var(--border-faint);
  }
</style>
