<script lang="ts">
  // A footnote shown over the page, so the place isn't lost.
  import { t } from '../../i18n/index.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { html, onclose, ongo }: { html: string; onclose: () => void; ongo: () => void } = $props();
</script>

<Sheet title={t('note.title')} {onclose}>
  <!-- The note is the document's own sanitised HTML (sanitize.ts). -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <div class="reading note-body">{@html html}</div>
  <div class="btn-row btn-row-start">
    <button
      type="button"
      class="btn btn-muted"
      id="goToNote"
      onclick={() => {
        onclose();
        ongo();
      }}>{t('note.goTo')}</button
    >
  </div>
</Sheet>
