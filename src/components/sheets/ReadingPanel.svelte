<script lang="ts">
  // The reader's Aa panel: short and see-through, so the page above it shows
  // each change as it's made. Four tabs, each holding only what applies to
  // the document open (a PDF has no typeface; a comic doesn't read aloud):
  //   Text   typeface, size, spacing, column, anchors, justify, book styles
  //   Page   reading mode and its own setting, PDF fit, zoom and Dusk pages,
  //          keeping the screen on, volume keys
  //   Light  theme, true black, dim and warmth
  //   Listen read aloud, its voice and speed
  import { onMount } from 'svelte';
  import { Select, Switch, TabRail } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import { pickFiles } from '../../lib/pick';
  import { volumeKeysAvailable } from '../../platform/device';
  import { FONT_ACCEPT, removeCustomFont, saveCustomFont } from '../../platform/fonts';
  import { reader } from '../../state/reader.svelte';
  import { FLOW_SPEED, FONT_SIZES, type Settings } from '../../state/settings';
  import { settings } from '../../state/settings.svelte';
  import { speech } from '../../state/speech.svelte';
  import { ui, type PanelTab } from '../../state/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import ThemeControls from './ThemeControls.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const v = $derived(settings.value);
  const set = (patch: Partial<Settings>) => void settings.update(patch);
  const size = (by: number) => set({ fontSize: Math.max(FONT_SIZES.min, Math.min(FONT_SIZES.max, v.fontSize + by)) });

  const c = $derived(reader.content);
  /** Reflowing text: everything a typeface and a column apply to. */
  const text = $derived(c?.kind === 'flow' && !c.pictures && !c.fixed);
  const pdf = $derived(c?.kind === 'pdf');
  const fixed = $derived(c?.kind === 'flow' && !!c.fixed);
  const pictures = $derived(c?.kind === 'flow' && !!c.pictures);
  const bookStyles = $derived(c?.kind === 'flow' && !!c.css);
  const canListen = $derived(!!c && !pictures && !fixed);

  const tabs = $derived(
    [
      text && { id: 'text' as const, label: t('panel.text'), domId: 'panel-text', controls: 'panelBody' },
      { id: 'page' as const, label: t('panel.page'), domId: 'panel-page', controls: 'panelBody' },
      { id: 'light' as const, label: t('panel.light'), domId: 'panel-light', controls: 'panelBody' },
      canListen && { id: 'listen' as const, label: t('panel.listen'), domId: 'panel-listen', controls: 'panelBody' },
    ].filter((x): x is { id: PanelTab; label: string; domId: string; controls: string } => !!x),
  );
  /** The tab last used, if it applies here; otherwise the first. */
  const tab = $derived(tabs.some((x) => x.id === ui.panelTab) ? ui.panelTab : tabs[0]!.id);

  onMount(() => void speech.loadVoices());

  async function addFont() {
    const [file] = await pickFiles(FONT_ACCEPT, false);
    if (!file) return;
    try {
      const name = await saveCustomFont(file);
      set({ customFont: name, typeface: 'custom' });
      ui.notify(t('type.fontAdded', { name }), 'success');
    } catch {
      ui.notify(t('type.fontFailed'), 'error');
    }
  }
  async function dropFont() {
    await removeCustomFont();
    set({ customFont: '', typeface: v.typeface === 'custom' ? 'serif' : v.typeface });
  }
  function chooseCustom() {
    if (v.customFont) set({ typeface: 'custom' });
    else void addFont();
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
</script>

<Sheet title={t('reader.type')} {onclose} peek>
  <div class="panel-tabs">
    <TabRail {tabs} value={tab} label={t('panel.label')} onselect={(id) => (ui.panelTab = id)} />
  </div>

  <div class="panel-body" id="panelBody" role="tabpanel" aria-labelledby="panel-{tab}">
    {#if tab === 'text'}
      <div class="field">
        <span class="t-field-label" id="faceLabel">{t('type.typeface')}</span>
        <div class="segmented" role="radiogroup" aria-labelledby="faceLabel">
          <button type="button" role="radio" class="face-serif" aria-checked={v.typeface === 'serif'} onclick={() => set({ typeface: 'serif' })}>{t('type.serif')}</button>
          <button type="button" role="radio" class="face-sans" aria-checked={v.typeface === 'sans'} onclick={() => set({ typeface: 'sans' })}>{t('type.sans')}</button>
          <button type="button" role="radio" class="face-custom" id="faceCustom" aria-checked={v.typeface === 'custom'} onclick={chooseCustom}>{t('type.yours')}</button>
        </div>
        {#if v.customFont}
          <div class="font-row">
            <span class="font-name ellipsis">{v.customFont}</span>
            <button type="button" class="btn btn-muted" id="changeFont" onclick={() => void addFont()}>{t('type.changeFont')}</button>
            <button type="button" class="btn-icon" id="removeFont" aria-label={t('type.removeFont', { name: v.customFont })} onclick={() => void dropFont()}><Icon name="trash-2" /></button>
          </div>
        {:else}
          <span class="field-hint">{t('type.yoursHint')}</span>
        {/if}
      </div>

      <div class="field">
        <span class="t-field-label" id="sizeLabel">{t('type.size')}</span>
        <div class="size-row">
          <button type="button" class="btn-icon" id="smaller" aria-label={t('type.smaller')} disabled={v.fontSize <= FONT_SIZES.min} onclick={() => size(-1)}><Icon name="minus" /></button>
          <input class="range" type="range" aria-labelledby="sizeLabel" min={FONT_SIZES.min} max={FONT_SIZES.max} step={FONT_SIZES.step} value={v.fontSize} oninput={(e) => set({ fontSize: Number(e.currentTarget.value) })} />
          <button type="button" class="btn-icon" id="larger" aria-label={t('type.larger')} disabled={v.fontSize >= FONT_SIZES.max} onclick={() => size(1)}><Icon name="plus" /></button>
          <span class="slider-value tabular" id="sizeValue">{v.fontSize}</span>
        </div>
      </div>

      <div class="field">
        <span class="t-field-label" id="spacingLabel">{t('type.spacing')}</span>
        <div class="segmented" role="radiogroup" aria-labelledby="spacingLabel">
          {#each [['compact', t('type.compact')], ['normal', t('type.normal')], ['loose', t('type.loose')]] as const as [id, label] (id)}
            <button type="button" role="radio" aria-checked={v.spacing === id} onclick={() => set({ spacing: id })}>{label}</button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span class="t-field-label" id="columnLabel">{t('type.column')}</span>
        <div class="segmented" role="radiogroup" aria-labelledby="columnLabel">
          {#each [['narrow', t('type.narrow')], ['medium', t('type.medium')], ['wide', t('type.wide')]] as const as [id, label] (id)}
            <button type="button" role="radio" aria-checked={v.measure === id} onclick={() => set({ measure: id })}>{label}</button>
          {/each}
        </div>
      </div>

      <div class="settings-list">
        <Switch checked={v.anchors} label={t('type.anchors')} hint={t('type.anchorsHint')} onchange={(on) => set({ anchors: on })} />
        <Switch checked={v.justify} label={t('type.justify')} hint={t('type.justifyHint')} onchange={(on) => set({ justify: on })} />
        {#if bookStyles}
          <Switch checked={v.publisherStyles} label={t('type.bookStyles')} hint={t('type.bookStylesHint')} onchange={(on) => set({ publisherStyles: on })} />
        {/if}
      </div>
    {:else if tab === 'page'}
      {#if !pdf && !fixed}
        <div class="field">
          <span class="t-field-label" id="modeLabel">{t('type.mode')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="modeLabel">
            <button type="button" role="radio" id="modeScroll" aria-checked={v.readingMode === 'scroll'} onclick={() => set({ readingMode: 'scroll' })}>{t('type.scroll')}</button>
            <button type="button" role="radio" id="modePaged" aria-checked={v.readingMode === 'paged'} onclick={() => set({ readingMode: 'paged' })}>{t('type.pages')}</button>
            {#if !pictures}<button type="button" role="radio" id="modeFlow" aria-checked={v.readingMode === 'flow'} onclick={() => set({ readingMode: 'flow' })}>{t('type.flow')}</button>{/if}
          </div>
          {#if v.readingMode === 'paged'}<span class="field-hint">{t('type.pagesHint')}</span>{/if}
          {#if v.readingMode === 'flow' && !pictures}<span class="field-hint">{t('type.flowHint')}</span>{/if}
        </div>

        {#if v.readingMode === 'flow' && !pictures}
          <div class="field">
            <span class="t-field-label" id="flowSpeedLabel">{t('type.flowSpeed')}</span>
            <div class="size-row">
              <button type="button" class="btn-icon" id="slower" aria-label={t('type.slower')} disabled={v.flowSpeed <= FLOW_SPEED.min} onclick={() => set({ flowSpeed: Math.max(FLOW_SPEED.min, v.flowSpeed - FLOW_SPEED.step) })}><Icon name="minus" /></button>
              <input class="range" type="range" id="flowSpeed" aria-labelledby="flowSpeedLabel" min={FLOW_SPEED.min} max={FLOW_SPEED.max} step={FLOW_SPEED.step} value={v.flowSpeed} oninput={(e) => set({ flowSpeed: Number(e.currentTarget.value) })} />
              <button type="button" class="btn-icon" id="faster" aria-label={t('type.faster')} disabled={v.flowSpeed >= FLOW_SPEED.max} onclick={() => set({ flowSpeed: Math.min(FLOW_SPEED.max, v.flowSpeed + FLOW_SPEED.step) })}><Icon name="plus" /></button>
              <span class="slider-value tabular" id="flowSpeedValue">{v.flowSpeed}</span>
            </div>
            <span class="field-hint">{t('type.flowSpeedHint')}</span>
          </div>
        {/if}

        {#if v.readingMode === 'paged'}
          <div class="field">
            <span class="t-field-label" id="turnLabel">{t('type.pageTurn')}</span>
            <div class="segmented" role="radiogroup" aria-labelledby="turnLabel">
              {#each [['curl', t('type.curl')], ['slide', t('type.slide')], ['none', t('type.none')]] as const as [id, label] (id)}
                <button type="button" role="radio" id="turn-{id}" aria-checked={v.pageTurn === id} onclick={() => set({ pageTurn: id })}>{label}</button>
              {/each}
            </div>
            <span class="field-hint">{t('type.pageTurnHint')}</span>
          </div>
        {/if}
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

      <div class="settings-list">
        <Switch checked={v.keepAwake} label={t('type.keepAwake')} hint={t('type.keepAwakeHint')} onchange={(on) => set({ keepAwake: on })} />
        {#if volumeKeysAvailable}
          <Switch checked={v.volumeKeys} label={t('type.volumeKeys')} hint={t('type.volumeKeysHint')} onchange={(on) => set({ volumeKeys: on })} />
        {/if}
      </div>
    {:else if tab === 'light'}
      <ThemeControls />
      <div class="field">
        <span class="t-field-label" id="dimLabel">{t('type.dim')}</span>
        <div class="size-row">
          <input class="range" type="range" id="dim" aria-labelledby="dimLabel" min="0" max="0.7" step="0.05" value={v.dim} oninput={(e) => set({ dim: Number(e.currentTarget.value) })} />
          <span class="slider-value tabular">{Math.round((v.dim / 0.7) * 100)}%</span>
        </div>
      </div>
      <div class="field">
        <span class="t-field-label" id="warmthLabel">{t('type.warmth')}</span>
        <div class="size-row">
          <input class="range" type="range" id="warmth" aria-labelledby="warmthLabel" min="0" max="1" step="0.05" value={v.warmth} oninput={(e) => set({ warmth: Number(e.currentTarget.value) })} />
          <span class="slider-value tabular">{Math.round(v.warmth * 100)}%</span>
        </div>
        <span class="field-hint">{t('type.nightHint')}</span>
      </div>
    {:else}
      <div class="listen-start">
        <button type="button" class="btn {speech.active ? 'btn-secondary' : 'btn-primary'}" id="readAloud" aria-pressed={speech.active} onclick={readAloud}><Icon name="volume-2" />{speech.active ? t('speech.stop') : t('speech.start')}</button>
        <span class="field-hint">{t('panel.listenHint')}</span>
      </div>
      <div class="field">
        <span class="t-field-label" id="rateLabel">{t('panel.rate')}</span>
        <div class="size-row">
          <button type="button" class="btn-icon" aria-label={t('speech.slower')} disabled={v.speechRate <= 0.5} onclick={() => void speech.setRate(v.speechRate - 0.1)}><Icon name="minus" /></button>
          <input class="range" type="range" aria-labelledby="rateLabel" min="0.5" max="2" step="0.1" value={v.speechRate} oninput={(e) => void speech.setRate(Number(e.currentTarget.value))} />
          <button type="button" class="btn-icon" aria-label={t('speech.faster')} disabled={v.speechRate >= 2} onclick={() => void speech.setRate(v.speechRate + 0.1)}><Icon name="plus" /></button>
          <span class="slider-value tabular">{v.speechRate.toFixed(1)}×</span>
        </div>
      </div>
      {#if speech.voices.length}
        <label class="field">
          <span class="t-field-label">{t('type.voice')}</span>
          <Select
            id="voice"
            value={v.voice}
            options={[{ value: '', label: t('type.systemVoice') }, ...speech.voices.map((voice) => ({ value: voice.name, label: `${voice.name} · ${voice.lang}` }))]}
            onchange={(voice) => set({ voice })}
          />
        </label>
      {/if}
    {/if}
  </div>
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

  /* Type controls */
  .size-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .slider-value {
    min-width: 2ch;
    font-family: var(--font-serif);
    font-size: 1.25rem;
    color: var(--text-heading);
    text-align: right;
  }
  .face-serif {
    font-family: var(--font-serif);
  }

  /* The reader's own font, named in itself, with a way to change or remove it. */
  .font-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .font-name {
    flex: 1;
    font-family: 'Rosetta Custom', var(--font-serif);
    font-size: 1.125rem;
    color: var(--text-heading);
  }
</style>
