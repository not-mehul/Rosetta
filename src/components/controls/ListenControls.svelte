<script lang="ts">
  // Read-aloud speed and voice: in a book under Aa → Listen, and in Settings.
  import { onMount } from 'svelte';
  import { Select } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import { SPEECH_RATE, type Settings } from '../../state/settings';
  import { speech } from '../../state/speech.svelte';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    v: Settings;
    set: (patch: Partial<Settings>) => void;
  }
  let { v, set }: Props = $props();
  onMount(() => void speech.loadVoices());
</script>

<div class="field">
  <span class="t-field-label" id="rateLabel">{t('panel.rate')}</span>
  <div class="control-row">
    <button type="button" class="btn-icon" aria-label={t('speech.slower')} disabled={v.speechRate <= SPEECH_RATE.min} onclick={() => void speech.setRate(v.speechRate - 0.1)}><Icon name="minus" /></button>
    <input class="range" type="range" id="speechRate" aria-labelledby="rateLabel" min={SPEECH_RATE.min} max={SPEECH_RATE.max} step="0.1" value={v.speechRate} oninput={(e) => void speech.setRate(Number(e.currentTarget.value))} />
    <button type="button" class="btn-icon" aria-label={t('speech.faster')} disabled={v.speechRate >= SPEECH_RATE.max} onclick={() => void speech.setRate(v.speechRate + 0.1)}><Icon name="plus" /></button>
    <span class="control-value tabular">{v.speechRate.toFixed(1)}×</span>
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
