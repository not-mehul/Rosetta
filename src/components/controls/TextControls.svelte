<script lang="ts">
  // Typeface, size, line spacing, justified lines and the book's original
  // style: in a book under Aa → Text, and as the defaults in Settings.
  import { Switch } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import { FONT_SIZES, type Settings } from '../../state/settings';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    v: Settings;
    set: (patch: Partial<Settings>) => void;
    /** Show "Original style": the book has styles of its own (always, for the defaults). */
    bookStyles: boolean;
  }
  let { v, set, bookStyles }: Props = $props();
  const size = (by: number) => set({ fontSize: Math.max(FONT_SIZES.min, Math.min(FONT_SIZES.max, v.fontSize + by)) });
</script>

<div class="field">
  <span class="t-field-label" id="faceLabel">{t('type.typeface')}</span>
  <div class="segmented" role="radiogroup" aria-labelledby="faceLabel">
    <button type="button" role="radio" class="face-serif" id="faceSerif" aria-checked={v.typeface === 'serif'} onclick={() => set({ typeface: 'serif' })}>{t('type.serif')}</button>
    <button type="button" role="radio" class="face-sans" id="faceSans" aria-checked={v.typeface === 'sans'} onclick={() => set({ typeface: 'sans' })}>{t('type.sans')}</button>
  </div>
</div>

<div class="field">
  <span class="t-field-label" id="sizeLabel">{t('type.size')}</span>
  <div class="control-row">
    <button type="button" class="btn-icon" id="smaller" aria-label={t('type.smaller')} disabled={v.fontSize <= FONT_SIZES.min} onclick={() => size(-1)}><Icon name="minus" /></button>
    <input class="range" type="range" aria-labelledby="sizeLabel" min={FONT_SIZES.min} max={FONT_SIZES.max} step={FONT_SIZES.step} value={v.fontSize} oninput={(e) => set({ fontSize: Number(e.currentTarget.value) })} />
    <button type="button" class="btn-icon" id="larger" aria-label={t('type.larger')} disabled={v.fontSize >= FONT_SIZES.max} onclick={() => size(1)}><Icon name="plus" /></button>
    <span class="control-value tabular" id="sizeValue">{v.fontSize}</span>
  </div>
</div>

<div class="field">
  <span class="t-field-label" id="spacingLabel">{t('type.spacing')}</span>
  <div class="segmented" role="radiogroup" aria-labelledby="spacingLabel">
    {#each [['compact', t('type.compact')], ['normal', t('type.normal')], ['loose', t('type.loose')]] as const as [id, label] (id)}
      <button type="button" role="radio" data-spacing={id} aria-checked={v.spacing === id} onclick={() => set({ spacing: id })}>{label}</button>
    {/each}
  </div>
</div>

<div class="settings-list">
  <Switch checked={v.justify} label={t('type.justify')} hint={t('type.justifyHint')} onchange={(on) => set({ justify: on })} />
  {#if bookStyles}
    <Switch checked={v.publisherStyles} label={t('type.bookStyles')} hint={t('type.bookStylesHint')} onchange={(on) => set({ publisherStyles: on })} />
  {/if}
</div>

<style>
  .face-serif {
    font-family: var(--font-serif);
  }
</style>
