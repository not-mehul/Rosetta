<script lang="ts">
  // Read-aloud controls, over the footer while reading aloud.
  import { t } from '../../i18n/index.svelte';
  import { settings } from '../../state/settings.svelte';
  import { speech } from '../../state/speech.svelte';
  import Icon from '../ui/Icon.svelte';

  const rate = $derived(settings.value.speechRate);
</script>

<div class="speech-bar panel" role="toolbar" aria-label={t('speech.title')}>
  <button type="button" class="btn-icon" aria-label={t('speech.back')} onclick={() => void speech.skip(-1)}><Icon name="skip-back" /></button>
  {#if speech.playing}
    <button type="button" class="btn-icon speech-main" id="speechPause" aria-label={t('speech.pause')} onclick={() => speech.pause()}><Icon name="pause" /></button>
  {:else}
    <button type="button" class="btn-icon speech-main" id="speechPlay" aria-label={t('speech.play')} onclick={() => void speech.play()}><Icon name="play" /></button>
  {/if}
  <button type="button" class="btn-icon" aria-label={t('speech.forward')} onclick={() => void speech.skip(1)}><Icon name="skip-forward" /></button>
  <span class="selection-rule" aria-hidden="true"></span>
  <button type="button" class="btn-icon" aria-label={t('speech.slower')} disabled={rate <= 0.5} onclick={() => void speech.setRate(rate - 0.1)}><Icon name="minus" /></button>
  <span class="t-data-small tabular speech-rate">{rate.toFixed(1)}×</span>
  <button type="button" class="btn-icon" aria-label={t('speech.faster')} disabled={rate >= 2} onclick={() => void speech.setRate(rate + 0.1)}><Icon name="plus" /></button>
  <button type="button" class="btn-icon" id="speechStop" aria-label={t('speech.stop')} onclick={() => speech.stop()}><Icon name="x" /></button>
</div>
