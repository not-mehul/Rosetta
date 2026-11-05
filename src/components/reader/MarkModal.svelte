<script lang="ts">
  // A highlight: its words, its colour and a note (style.md §8.10).
  import { t } from '../../i18n/index.svelte';
  import { shareQuote } from '../../lib/quote';
  import type { HighlightColour } from '../../state/db';
  import { reader } from '../../state/reader.svelte';
  import Icon from '../ui/Icon.svelte';
  import Modal from '../ui/Modal.svelte';
  import { COLOURS } from './colours';

  let { id, onclose }: { id: string; onclose: () => void } = $props();
  const mark = $derived(reader.marks.find((m) => m.id === id));
  let note = $state(reader.marks.find((m) => m.id === id)?.note ?? '');

  async function done() {
    if (mark && note !== mark.note) await reader.updateMark(id, { note: note.trim() });
    onclose();
  }

  async function remove() {
    onclose();
    await reader.removeMark(id);
  }

  function colour(c: HighlightColour) {
    void reader.updateMark(id, { colour: c });
  }
</script>

{#if mark}
  <Modal title={t('mark.title')} eyebrow={mark.where || undefined} closeLabel={t('action.close')} onclose={() => void done()}>
    <blockquote class="mark-quote hl hl-{mark.colour}">{mark.text}</blockquote>
    <div class="field">
      <span class="t-field-label">{t('mark.colour')}</span>
      <div class="swatches" role="radiogroup" aria-label={t('mark.colour')}>
        {#each COLOURS as c (c.id)}
          <button type="button" role="radio" class="swatch swatch-{c.id}" aria-checked={mark.colour === c.id} aria-label={t(`colour.${c.id}`)} onclick={() => colour(c.id)}></button>
        {/each}
      </div>
    </div>
    <label class="field">
      <span class="t-field-label">{t('mark.note')}</span>
      <textarea class="textarea" id="noteText" rows="4" placeholder={t('mark.notePlaceholder')} enterkeyhint="done" bind:value={note}></textarea>
    </label>
    <div class="btn-row">
      <button type="button" class="btn btn-danger" onclick={() => void remove()}>{t('action.remove')}</button>
      {#if reader.doc}<button type="button" class="btn btn-muted" id="shareQuote" onclick={() => void shareQuote(mark, reader.doc!)}><Icon name="share-2" />{t('mark.share')}</button>{/if}
      <button type="button" class="btn btn-primary" id="saveNote" onclick={() => void done()}>{t('action.done')}</button>
    </div>
  </Modal>
{/if}
