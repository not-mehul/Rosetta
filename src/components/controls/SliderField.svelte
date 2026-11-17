<script lang="ts">
  // A setting on a scale, with steps either side and its value in serif
  // (style.md §8.6, Slider): Flow speed and auto-scroll's pace.
  import Icon from '../ui/Icon.svelte';

  interface Props {
    id: string;
    label: string;
    hint?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    /** The value as shown. */
    shown: string;
    lessLabel: string;
    moreLabel: string;
    onchange: (value: number) => void;
  }
  let { id, label, hint, value, min, max, step, shown, lessLabel, moreLabel, onchange }: Props = $props();
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
</script>

<div class="field">
  <span class="t-field-label" id="{id}Label">{label}</span>
  <div class="control-row">
    <button type="button" class="btn-icon" id="{id}Less" aria-label={lessLabel} disabled={value <= min} onclick={() => onchange(clamp(value - step))}><Icon name="minus" /></button>
    <input class="range" type="range" {id} aria-labelledby="{id}Label" {min} {max} {step} {value} oninput={(e) => onchange(Number(e.currentTarget.value))} />
    <button type="button" class="btn-icon" id="{id}More" aria-label={moreLabel} disabled={value >= max} onclick={() => onchange(clamp(value + step))}><Icon name="plus" /></button>
    <span class="control-value tabular" id="{id}Value">{shown}</span>
  </div>
  {#if hint}<span class="field-hint">{hint}</span>{/if}
</div>
