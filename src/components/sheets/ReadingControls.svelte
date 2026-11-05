<script lang="ts">
  // Type and theme: shared by the reader's Aa sheet and Settings.
  import { settings } from '../../state/settings.svelte';
  import { FONT_SIZES, type Settings } from '../../state/settings';
  import Icon from '../ui/Icon.svelte';
  import Switch from '../ui/Switch.svelte';

  /** Which controls to show: flow text, PDF pages, or both (Settings). */
  let { show = 'both' }: { show?: 'flow' | 'pdf' | 'both' } = $props();
  const v = $derived(settings.value);
  const set = (patch: Partial<Settings>) => void settings.update(patch);
  const size = (by: number) => set({ fontSize: Math.max(FONT_SIZES.min, Math.min(FONT_SIZES.max, v.fontSize + by)) });
</script>

<div class="field">
  <span class="t-field-label">Theme</span>
  <div class="segmented" role="radiogroup" aria-label="Theme">
    {#each [['system', 'System'], ['dark', 'Dusk'], ['light', 'Dawn']] as const as [id, label] (id)}
      <button type="button" role="radio" aria-checked={v.theme === id} onclick={() => set({ theme: id })}>{label}</button>
    {/each}
  </div>
</div>

{#if show !== 'pdf'}
  <div class="field">
    <span class="t-field-label">Typeface</span>
    <div class="segmented" role="radiogroup" aria-label="Typeface">
      <button type="button" role="radio" class="face-serif" aria-checked={v.typeface === 'serif'} onclick={() => set({ typeface: 'serif' })}>Serif</button>
      <button type="button" role="radio" class="face-sans" aria-checked={v.typeface === 'sans'} onclick={() => set({ typeface: 'sans' })}>Sans</button>
    </div>
  </div>

  <div class="field">
    <span class="t-field-label" id="sizeLabel">Size</span>
    <div class="size-row">
      <button type="button" class="btn-icon" id="smaller" aria-label="Smaller" disabled={v.fontSize <= FONT_SIZES.min} onclick={() => size(-1)}><Icon name="minus" /></button>
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
      <button type="button" class="btn-icon" id="larger" aria-label="Larger" disabled={v.fontSize >= FONT_SIZES.max} onclick={() => size(1)}><Icon name="plus" /></button>
      <span class="slider-value tabular" id="sizeValue">{v.fontSize}</span>
    </div>
  </div>

  <div class="field">
    <span class="t-field-label">Line spacing</span>
    <div class="segmented" role="radiogroup" aria-label="Line spacing">
      {#each [['compact', 'Compact'], ['normal', 'Normal'], ['loose', 'Loose']] as const as [id, label] (id)}
        <button type="button" role="radio" aria-checked={v.spacing === id} onclick={() => set({ spacing: id })}>{label}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="t-field-label">Column</span>
    <div class="segmented" role="radiogroup" aria-label="Column width">
      {#each [['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide']] as const as [id, label] (id)}
        <button type="button" role="radio" aria-checked={v.measure === id} onclick={() => set({ measure: id })}>{label}</button>
      {/each}
    </div>
  </div>

  <div class="settings-list">
    <Switch checked={v.justify} label="Justify lines" hint="Even right edges, with hyphenation where the language allows." onchange={(on) => set({ justify: on })} />
  </div>
{/if}

{#if show !== 'flow'}
  <div class="field">
    <span class="t-field-label">PDF zoom</span>
    <div class="segmented" role="radiogroup" aria-label="PDF zoom">
      {#each [1, 1.25, 1.5, 2] as const as z (z)}
        <button type="button" role="radio" aria-checked={v.pdfZoom === z} onclick={() => set({ pdfZoom: z })}>{z === 1 ? 'Fit' : `${z * 100}%`}</button>
      {/each}
    </div>
    <span class="field-hint">Fit sets the page to the width of the column.</span>
  </div>
  <div class="settings-list">
    <Switch checked={v.pageTone === 'theme'} label="Dusk pages" hint="In Dusk, PDF pages are inverted to light on dark. Photographs invert too." onchange={(on) => set({ pageTone: on ? 'theme' : 'original' })} />
  </div>
{/if}
