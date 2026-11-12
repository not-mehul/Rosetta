<script lang="ts">
  // Type, theme and reading: shared by the reader's Aa sheet and Settings.
  import { onMount } from 'svelte';
  import { LOCALE_NAMES, LOCALES, t } from '../../i18n/index.svelte';
  import { volumeKeysAvailable } from '../../platform/device';
  import { isNative } from '../../platform/native';
  import { reader } from '../../state/reader.svelte';
  import { settings } from '../../state/settings.svelte';
  import { FLOW_SPEED, FONT_SIZES, type Settings } from '../../state/settings';
  import { FONT_ACCEPT, removeCustomFont, saveCustomFont } from '../../platform/fonts';
  import { pickFiles } from '../../lib/pick';
  import { ui } from '../../state/ui.svelte';
  import { speech } from '../../state/speech.svelte';
  import Icon from '../ui/Icon.svelte';
  import Switch from '../ui/Switch.svelte';

  /** Which controls to show: flow text, PDF pages, or both (Settings). */
  let { show = 'both' }: { show?: 'flow' | 'pdf' | 'both' } = $props();
  const v = $derived(settings.value);
  const set = (patch: Partial<Settings>) => void settings.update(patch);
  const size = (by: number) => set({ fontSize: Math.max(FONT_SIZES.min, Math.min(FONT_SIZES.max, v.fontSize + by)) });
  const hasBookStyles = $derived(show === 'both' || (reader.content?.kind === 'flow' && !!reader.content.css));

  onMount(() => void speech.loadVoices());

  /** Picks a font file, keeps it, and reads in it. */
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
</script>

<div class="field">
  <span class="t-field-label">{t('type.theme')}</span>
  <div class="segmented" role="radiogroup" aria-label={t('type.theme')}>
    {#each [['system', t('type.system')], ['dark', t('type.dusk')], ['light', t('type.dawn')]] as const as [id, label] (id)}
      <button type="button" role="radio" aria-checked={v.theme === id} onclick={() => set({ theme: id })}>{label}</button>
    {/each}
  </div>
</div>

{#if show === 'both'}
  <label class="field">
    <span class="t-field-label">{t('type.language')}</span>
    <select class="input" id="language" value={v.locale} onchange={(e) => set({ locale: e.currentTarget.value as Settings['locale'] })}>
      <option value="system">{t('type.system')}</option>
      {#each LOCALES as l (l)}<option value={l}>{LOCALE_NAMES[l]}</option>{/each}
    </select>
  </label>
{/if}

{#if show !== 'pdf'}
  <div class="field">
    <span class="t-field-label">{t('type.mode')}</span>
    <div class="segmented" role="radiogroup" aria-label={t('type.mode')}>
      <button type="button" role="radio" id="modeScroll" aria-checked={v.readingMode === 'scroll'} onclick={() => set({ readingMode: 'scroll' })}>{t('type.scroll')}</button>
      <button type="button" role="radio" id="modePaged" aria-checked={v.readingMode === 'paged'} onclick={() => set({ readingMode: 'paged' })}>{t('type.pages')}</button>
      <button type="button" role="radio" id="modeFlow" aria-checked={v.readingMode === 'flow'} onclick={() => set({ readingMode: 'flow' })}>{t('type.flow')}</button>
    </div>
    {#if v.readingMode === 'paged'}<span class="field-hint">{t('type.pagesHint')}</span>{/if}
    {#if v.readingMode === 'flow'}<span class="field-hint">{t('type.flowHint')}</span>{/if}
  </div>

  {#if v.readingMode === 'flow' || show === 'both'}
    <div class="field">
      <span class="t-field-label" id="flowSpeedLabel">{t('type.flowSpeed')}</span>
      <div class="size-row">
        <button type="button" class="btn-icon" id="slower" aria-label={t('type.slower')} disabled={v.flowSpeed <= FLOW_SPEED.min} onclick={() => set({ flowSpeed: Math.max(FLOW_SPEED.min, v.flowSpeed - FLOW_SPEED.step) })}><Icon name="minus" /></button>
        <input
          class="slider"
          type="range"
          id="flowSpeed"
          aria-labelledby="flowSpeedLabel"
          min={FLOW_SPEED.min}
          max={FLOW_SPEED.max}
          step={FLOW_SPEED.step}
          value={v.flowSpeed}
          oninput={(e) => set({ flowSpeed: Number(e.currentTarget.value) })}
        />
        <button type="button" class="btn-icon" id="faster" aria-label={t('type.faster')} disabled={v.flowSpeed >= FLOW_SPEED.max} onclick={() => set({ flowSpeed: Math.min(FLOW_SPEED.max, v.flowSpeed + FLOW_SPEED.step) })}><Icon name="plus" /></button>
        <span class="slider-value tabular" id="flowSpeedValue">{v.flowSpeed}</span>
      </div>
      <span class="field-hint">{t('type.flowSpeedHint')}</span>
    </div>
  {/if}

  {#if v.readingMode === 'paged' || show === 'both'}
    <div class="field">
      <span class="t-field-label">{t('type.pageTurn')}</span>
      <div class="segmented" role="radiogroup" aria-label={t('type.pageTurn')}>
        {#each [['curl', t('type.curl')], ['slide', t('type.slide')], ['none', t('type.none')]] as const as [id, label] (id)}
          <button type="button" role="radio" id="turn-{id}" aria-checked={v.pageTurn === id} onclick={() => set({ pageTurn: id })}>{label}</button>
        {/each}
      </div>
      <span class="field-hint">{t('type.pageTurnHint')}</span>
    </div>
  {/if}

  <div class="field">
    <span class="t-field-label">{t('type.typeface')}</span>
    <div class="segmented" role="radiogroup" aria-label={t('type.typeface')}>
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
      <input
        class="slider"
        type="range"
        aria-labelledby="sizeLabel"
        min={FONT_SIZES.min}
        max={FONT_SIZES.max}
        step={FONT_SIZES.step}
        value={v.fontSize}
        oninput={(e) => set({ fontSize: Number(e.currentTarget.value) })}
      />
      <button type="button" class="btn-icon" id="larger" aria-label={t('type.larger')} disabled={v.fontSize >= FONT_SIZES.max} onclick={() => size(1)}><Icon name="plus" /></button>
      <span class="slider-value tabular" id="sizeValue">{v.fontSize}</span>
    </div>
  </div>

  <div class="field">
    <span class="t-field-label">{t('type.spacing')}</span>
    <div class="segmented" role="radiogroup" aria-label={t('type.spacing')}>
      {#each [['compact', t('type.compact')], ['normal', t('type.normal')], ['loose', t('type.loose')]] as const as [id, label] (id)}
        <button type="button" role="radio" aria-checked={v.spacing === id} onclick={() => set({ spacing: id })}>{label}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="t-field-label">{t('type.column')}</span>
    <div class="segmented" role="radiogroup" aria-label={t('type.column')}>
      {#each [['narrow', t('type.narrow')], ['medium', t('type.medium')], ['wide', t('type.wide')]] as const as [id, label] (id)}
        <button type="button" role="radio" aria-checked={v.measure === id} onclick={() => set({ measure: id })}>{label}</button>
      {/each}
    </div>
  </div>

  <div class="settings-list">
    <Switch checked={v.anchors} label={t('type.anchors')} hint={t('type.anchorsHint')} onchange={(on) => set({ anchors: on })} />
    <Switch checked={v.justify} label={t('type.justify')} hint={t('type.justifyHint')} onchange={(on) => set({ justify: on })} />
    {#if hasBookStyles}
      <Switch checked={v.publisherStyles} label={t('type.bookStyles')} hint={t('type.bookStylesHint')} onchange={(on) => set({ publisherStyles: on })} />
    {/if}
  </div>
{/if}

{#if show !== 'flow'}
  <div class="field">
    <span class="t-field-label">{t('type.pdfFit')}</span>
    <div class="segmented" role="radiogroup" aria-label={t('type.pdfFit')}>
      <button type="button" role="radio" id="fitWidth" aria-checked={v.pdfFit === 'width'} onclick={() => set({ pdfFit: 'width', pdfZoom: 1 })}>{t('type.fitWidth')}</button>
      <button type="button" role="radio" id="fitPage" aria-checked={v.pdfFit === 'page'} onclick={() => set({ pdfFit: 'page', pdfZoom: 1 })}>{t('type.fitPage')}</button>
    </div>
  </div>
  <div class="field">
    <span class="t-field-label">{t('type.pdfZoom')}</span>
    <div class="segmented" role="radiogroup" aria-label={t('type.pdfZoom')}>
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

<div class="field">
  <span class="t-field-label" id="dimLabel">{t('type.dim')}</span>
  <div class="size-row">
    <input class="slider" type="range" id="dim" aria-labelledby="dimLabel" min="0" max="0.7" step="0.05" value={v.dim} oninput={(e) => set({ dim: Number(e.currentTarget.value) })} />
    <span class="slider-value tabular">{Math.round((v.dim / 0.7) * 100)}%</span>
  </div>
</div>
<div class="field">
  <span class="t-field-label" id="warmthLabel">{t('type.warmth')}</span>
  <div class="size-row">
    <input class="slider" type="range" id="warmth" aria-labelledby="warmthLabel" min="0" max="1" step="0.05" value={v.warmth} oninput={(e) => set({ warmth: Number(e.currentTarget.value) })} />
    <span class="slider-value tabular">{Math.round(v.warmth * 100)}%</span>
  </div>
  <span class="field-hint">{t('type.nightHint')}</span>
</div>

<div class="settings-list">
  <Switch checked={v.keepAwake} label={t('type.keepAwake')} hint={t('type.keepAwakeHint')} onchange={(on) => set({ keepAwake: on })} />
  {#if volumeKeysAvailable || (show === 'both' && isNative)}
    <Switch checked={v.volumeKeys} label={t('type.volumeKeys')} hint={t('type.volumeKeysHint')} onchange={(on) => set({ volumeKeys: on })} />
  {/if}
  {#if isNative}
    <Switch checked={v.haptics} label={t('type.haptics')} hint={t('type.hapticsHint')} onchange={(on) => set({ haptics: on })} />
  {/if}
</div>

{#if speech.voices.length}
  <label class="field">
    <span class="t-field-label">{t('type.voice')}</span>
    <select class="input" id="voice" value={v.voice} onchange={(e) => set({ voice: e.currentTarget.value })}>
      <option value="">{t('type.systemVoice')}</option>
      {#each speech.voices as voice (voice.index)}<option value={voice.name}>{voice.name} · {voice.lang}</option>{/each}
    </select>
  </label>
{/if}
