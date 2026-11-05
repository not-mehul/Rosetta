<script lang="ts">
  // A highlight: its words, its colour and a note (style.md §8.10).
  import type { HighlightColour } from '../../state/db';
  import { reader } from '../../state/reader.svelte';
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
  <Modal title="Highlight" eyebrow={mark.where || undefined} closeLabel="Close" onclose={() => void done()}>
    <blockquote class="mark-quote hl hl-{mark.colour}">{mark.text}</blockquote>
    <div class="field">
      <span class="t-field-label">Colour</span>
      <div class="swatches" role="radiogroup" aria-label="Colour">
        {#each COLOURS as c (c.id)}
          <button type="button" role="radio" class="swatch swatch-{c.id}" aria-checked={mark.colour === c.id} aria-label={c.label} onclick={() => colour(c.id)}></button>
        {/each}
      </div>
    </div>
    <label class="field">
      <span class="t-field-label">Note</span>
      <textarea class="textarea" id="noteText" rows="4" placeholder="What it made you think" enterkeyhint="done" bind:value={note}></textarea>
    </label>
    <div class="btn-row">
      <button type="button" class="btn btn-danger" onclick={() => void remove()}>Remove</button>
      <button type="button" class="btn btn-primary" id="saveNote" onclick={() => void done()}>Done</button>
    </div>
  </Modal>
{/if}
