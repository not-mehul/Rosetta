<script lang="ts">
  // The bar under a selection: highlight in a colour, highlight with a note, or copy.
  import { t } from '../../i18n/index.svelte';
  import { lookUp } from '../../platform/output';
  import type { HighlightColour } from '../../state/db';
  import { ui } from '../../state/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import { COLOURS } from './colours';

  interface Props {
    /** The selection's box on screen. */
    rect: DOMRect;
    text: string;
    onhighlight: (colour: HighlightColour, withNote: boolean) => void;
  }

  let { rect, text, onhighlight }: Props = $props();
  let bar = $state<HTMLDivElement>();
  let width = $state(260);
  const BAR_H = 52;

  // Below the selection, where the system's own menu isn't; above it near the bottom.
  const top = $derived(rect.bottom + 12 + BAR_H < innerHeight - 64 ? rect.bottom + 12 : Math.max(72, rect.top - BAR_H - 12));
  const left = $derived(Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)));

  $effect(() => {
    if (bar) width = bar.offsetWidth;
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      ui.notify(t('selection.copied'), 'success');
    } catch {
      ui.notify(t('selection.copyFailed'), 'error');
    }
    getSelection()?.removeAllRanges();
  }
</script>

<div class="selection-bar" role="toolbar" tabindex="-1" aria-label={t('selection.label')} bind:this={bar} style:top="{top}px" style:left="{left}px" onpointerdown={(e) => e.preventDefault()}>
  {#each COLOURS as c (c.id)}
    <button type="button" class="swatch swatch-{c.id}" data-colour={c.id} aria-label={t('selection.highlightIn', { colour: t(`colour.${c.id}`) })} onclick={() => onhighlight(c.id, false)}></button>
  {/each}
  <span class="selection-rule" aria-hidden="true"></span>
  <button type="button" class="btn-icon" id="noteSelection" aria-label={t('selection.withNote')} onclick={() => onhighlight('amber', true)}><Icon name="notebook-pen" /></button>
  <button type="button" class="btn-icon" id="lookUp" aria-label={t('selection.lookUp')} onclick={() => void lookUp(text)}><Icon name="book-a" /></button>
  <button type="button" class="btn-icon" aria-label={t('selection.copy')} onclick={() => void copy()}><Icon name="copy" /></button>
</div>
