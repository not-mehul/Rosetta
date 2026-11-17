<script lang="ts">
  // Auto-scroll's controls, in the footer while it's on: pause or go on, its
  // pace in lines a minute, and stop.
  import { t } from '../../i18n/index.svelte';
  import { AUTO_SCROLL, autoScroll } from '../../state/autoscroll.svelte';
  import Icon from '../ui/Icon.svelte';

  const speed = $derived(autoScroll.speed);
</script>

<div class="autoscroll-bar" role="group" aria-label={t('autoscroll.label')}>
  {#if autoScroll.running}
    <button type="button" class="btn-icon autoscroll-main" id="autoScrollPause" aria-label={t('autoscroll.pause')} onclick={() => autoScroll.pause()}><Icon name="pause" /></button>
  {:else}
    <button type="button" class="btn-icon autoscroll-main" id="autoScrollPlay" aria-label={t('autoscroll.resume')} onclick={() => autoScroll.resume()}><Icon name="play" /></button>
  {/if}
  <button type="button" class="btn-icon" id="autoScrollSlower" aria-label={t('autoscroll.slower')} disabled={speed <= AUTO_SCROLL.min} onclick={() => void autoScroll.setSpeed(speed - AUTO_SCROLL.step)}><Icon name="minus" /></button>
  <span class="t-data-small tabular autoscroll-speed" id="autoScrollSpeed">{t('autoscroll.speed', { lines: speed })}</span>
  <button type="button" class="btn-icon" id="autoScrollFaster" aria-label={t('autoscroll.faster')} disabled={speed >= AUTO_SCROLL.max} onclick={() => void autoScroll.setSpeed(speed + AUTO_SCROLL.step)}><Icon name="plus" /></button>
  <button type="button" class="btn-icon" id="autoScrollStop" aria-label={t('autoscroll.stop')} onclick={() => autoScroll.stop()}><Icon name="x" /></button>
</div>

<style>
  .autoscroll-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    margin: var(--space-2) 0 0;
    padding: var(--space-1) var(--space-2);
  }
  .autoscroll-main {
    color: var(--accent-amber);
  }
  .autoscroll-speed {
    min-width: 7ch;
    text-align: center;
  }
</style>
