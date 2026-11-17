<script lang="ts">
  // How the words come: scrolling, a page at a time, or Flow's sentence at a
  // time; and keeping the screen on. In a book under Aa → Page, and as the
  // defaults in Settings.
  import { Switch } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import type { Settings } from '../../state/settings';
  import Icon from '../ui/Icon.svelte';

  interface Props {
    v: Settings;
    set: (patch: Partial<Settings>) => void;
    /** A comic or picture book: no Flow. */
    pictures?: boolean;
    /** Offered in scroll mode, in a book: starts auto-scroll. */
    onautoscroll?: () => void;
  }
  let { v, set, pictures = false, onautoscroll }: Props = $props();
</script>

<div class="field">
  <span class="t-field-label" id="modeLabel">{t('type.mode')}</span>
  <div class="segmented" role="radiogroup" aria-labelledby="modeLabel">
    <button type="button" role="radio" id="modeScroll" aria-checked={v.readingMode === 'scroll'} onclick={() => set({ readingMode: 'scroll' })}>{t('type.scroll')}</button>
    <button type="button" role="radio" id="modePaged" aria-checked={v.readingMode === 'paged'} onclick={() => set({ readingMode: 'paged' })}>{t('type.pages')}</button>
    {#if !pictures}<button type="button" role="radio" id="modeFlow" aria-checked={v.readingMode === 'flow'} onclick={() => set({ readingMode: 'flow' })}>{t('type.flow')}</button>{/if}
  </div>
  {#if v.readingMode === 'paged'}
    <span class="field-hint">{t('type.pagesHint')}</span>
  {:else if v.readingMode === 'flow' && !pictures}
    <span class="field-hint">{t('type.flowHint')}</span>
  {/if}
  {#if v.readingMode === 'scroll' && onautoscroll}
    <button type="button" class="btn btn-secondary autoscroll-start" id="startAutoScroll" onclick={onautoscroll}><Icon name="play" />{t('autoscroll.start')}</button>
  {/if}
</div>

<div class="settings-list">
  <Switch checked={v.keepAwake} label={t('type.keepAwake')} hint={t('type.keepAwakeHint')} onchange={(on) => set({ keepAwake: on })} />
</div>

<style>
  .autoscroll-start {
    align-self: flex-start;
    margin-top: var(--space-2);
  }
</style>
