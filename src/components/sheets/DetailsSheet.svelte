<script lang="ts">
  // A document's details: the cover and how far through at the top, one
  // button to read it (and one to mark it finished), the facts, then
  // everything else as rows; Remove alone at the bottom (style.md §7.2, §8.17).
  import { FORMAT_LABEL } from '../../formats/types';
  import { t } from '../../i18n/index.svelte';
  import { notesMarkdown, slug } from '../../lib/export';
  import { fileSize, relativeDay } from '../../lib/format';
  import { openInColophon, sendToBookShelf, sendToNookling, canOpen } from '../../platform/handoff';
  import { saveFile, shareFile, shareText } from '../../platform/output';
  import { restoreFile } from '../../state/intake';
  import { duration } from '../../lib/format';
  import { db } from '../../state/db';
  import { library, nextInSeries } from '../../state/library.svelte';
  import { reader } from '../../state/reader.svelte';
  import { ui } from '../../state/ui.svelte';
  import type { Mark } from '../../state/db';
  import Cover from '../ui/Cover.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { id, onclose }: { id: string; onclose: () => void } = $props();
  const doc = $derived(library.get(id));
  let marks = $state.raw<Mark[]>([]);
  $effect(() => {
    void library.marks(id).then((m) => (marks = m));
  });
  const highlights = $derived(marks.filter((m) => m.kind === 'highlight').length);
  const bookmarks = $derived(marks.filter((m) => m.kind === 'bookmark').length);
  /** Time spent in this document, and on how many days. */
  let time = $state.raw<{ ms: number; days: number }>({ ms: 0, days: 0 });
  $effect(() => {
    void db.sessions
      .where('docId')
      .equals(id)
      .toArray()
      .then((rows) => (time = { ms: rows.reduce((a, r) => a + r.ms, 0), days: rows.length }))
      .catch(() => undefined);
  });
  const next = $derived(doc ? nextInSeries(library.items, doc) : undefined);
  const collectionNames = $derived(doc ? library.collections.filter((c) => doc.collections.includes(c.id)).map((c) => c.name) : []);

  // The note on the whole book saves as it is typed, a moment after the last key, and on leaving the field.
  let noteDraft: string | null = null;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  function keepNote(text: string) {
    noteDraft = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(saveNote, 600);
  }
  function saveNote() {
    clearTimeout(noteTimer);
    if (noteDraft === null || noteDraft === (doc?.note ?? '')) return;
    void library.update(id, { note: noteDraft });
    noteDraft = null;
  }
  $effect(() => () => saveNote());

  function toggleFinished() {
    if (!doc) return;
    void library.update(id, { finishedAt: doc.finishedAt ? null : Date.now() });
  }

  async function startOver() {
    await library.update(id, { location: null, progress: 0, finishedAt: null });
    ui.notify(t('details.startedOver'), 'success');
  }

  async function exportNotes() {
    if (!doc) return;
    const out = await saveFile({ name: `${slug(doc.title)}-notes.md`, data: new TextEncoder().encode(notesMarkdown(doc, marks)), mime: 'text/markdown' });
    ui.notify(t('saved.to', { where: out.label }), 'success');
  }

  async function share() {
    if (!doc) return;
    const bytes = await library.bytes(id);
    if (bytes) await shareFile({ name: doc.fileName, data: bytes, mime: 'application/octet-stream' }, doc.title);
  }

  async function bookShelf() {
    if (!doc) return;
    const sent = await sendToBookShelf(doc);
    if (!sent) {
      // No BookShelf to take it: offer the details as text instead.
      await shareText(doc.title, `${doc.title}${doc.author ? ` — ${doc.author}` : ''}`);
      ui.notify(t('details.noBookShelf'), 'info');
    }
  }

  // Nookling keeps a shelf of finished books; offered once the book is finished, when Nookling is here.
  let nookling = $state(false);
  $effect(() => {
    void canOpen('nookling').then((v) => (nookling = v));
  });

  async function toNookling() {
    if (!doc) return;
    if (!(await sendToNookling(doc))) ui.notify(t('details.noNookling'), 'info');
  }

  async function colophon() {
    if (!doc) return;
    const bytes = await library.bytes(id);
    if (bytes) await openInColophon(doc.fileName, bytes, doc.title);
  }

  async function offload() {
    if (!doc) return;
    const ok = await ui.confirm({ title: t('details.offloadTitle'), message: t('details.offloadMessage', { size: fileSize(doc.size) }), action: t('details.offload') });
    if (!ok) return;
    await library.offload(id);
    ui.notify(t('details.offloaded'), 'success');
  }

  async function remove() {
    if (!doc) return;
    const title = doc.title;
    onclose();
    const undo = await library.remove(id);
    ui.undoable(t('details.removed', { title }), () => void undo());
  }
</script>

{#if doc}
  <Sheet title={t('details.title')} {onclose}>
    <div class="details-head">
      <div class="details-cover" aria-hidden="true"><Cover {doc} /></div>
      <div class="details-name">
        <h3 class="details-title">{doc.title}</h3>
        {#if doc.author}<p class="details-author">{doc.author}</p>{/if}
        {#if doc.series}<p class="t-data-small dim">{doc.series}{doc.seriesIndex !== null ? ` · ${doc.seriesIndex}` : ''}</p>{/if}
        <p class="t-data-small details-state">
          {#if doc.finishedAt}<span class="sage">{t('details.finishedOn', { when: relativeDay(doc.finishedAt) })}</span>
          {:else if doc.openedAt}<span class="amber tabular">{Math.floor(doc.progress * 100)}%</span> <span class="dim">· {relativeDay(doc.openedAt)}</span>
          {:else}<span class="dim">{t('details.notOpened')}</span>{/if}
        </p>
        {#if doc.openedAt && !doc.finishedAt}
          <span class="meter" aria-hidden="true"><span class="meter-fill" style:transform="scaleX({doc.progress})"></span></span>
        {/if}
      </div>
    </div>

    <div class="details-actions">
      {#if doc.offloaded}
        <button type="button" class="btn btn-primary" id="restoreFile" onclick={() => void restoreFile(id)}><Icon name="download" />{t('details.addFileAgain')}</button>
      {:else}
        <button
          type="button"
          class="btn btn-primary"
          id="readDoc"
          onclick={() => {
            onclose();
            void reader.open(id);
          }}><Icon name="book-open" />{doc.openedAt && !doc.finishedAt ? t('details.continue') : t('details.readAction')}</button
        >
      {/if}
      <button type="button" class="btn btn-secondary" id="toggleFinished" onclick={toggleFinished}><Icon name={doc.finishedAt ? 'rotate-ccw' : 'check'} />{doc.finishedAt ? t('details.markUnread') : t('details.markFinished')}</button>
    </div>

    {#if next}
      <button
        type="button"
        class="details-next"
        id="nextInSeries"
        onclick={() => {
          onclose();
          void reader.open(next.id);
        }}
      >
        <span class="t-field-label">{t('details.nextInSeries')}</span>
        <span class="details-next-title ellipsis">{next.title}</span>
        <Icon name="chevron-right" />
      </button>
    {/if}

    {#if doc.tags.length || collectionNames.length}
      <div class="chip-row details-tags">
        {#each collectionNames as name (name)}<span class="chip-status">{name}</span>{/each}
        {#each doc.tags as tag (tag)}<span class="chip-tag">#{tag}</span>{/each}
      </div>
    {/if}

    <label class="field details-note">
      <span class="t-field-label">{t('details.note')}</span>
      <textarea class="textarea" id="bookNote" rows="3" placeholder={t('details.notePlaceholder')} value={doc.note ?? ''} oninput={(e) => keepNote(e.currentTarget.value)} onblur={() => saveNote()}></textarea>
    </label>

    <dl class="details-facts">
      <div><dt class="t-field-label">{t('details.format')}</dt><dd class="t-data">{FORMAT_LABEL[doc.format]} · {doc.offloaded ? t('details.offloadedShort') : fileSize(doc.size)}</dd></div>
      <div><dt class="t-field-label">{t('details.added')}</dt><dd class="t-data">{relativeDay(doc.addedAt)}</dd></div>
      {#if time.ms >= 60_000}<div><dt class="t-field-label">{t('details.time')}</dt><dd class="t-data" id="detailsTime">{t('details.timeOver', { time: duration(time.ms), days: t('stats.days', { count: time.days }) })}</dd></div>{/if}
      {#if marks.length}<div><dt class="t-field-label">{t('details.marks')}</dt><dd class="t-data">{t('details.markCounts', { highlights, bookmarks })}</dd></div>{/if}
    </dl>
    <p class="t-data-small faint details-file ellipsis">{doc.fileName}</p>

    <!-- Everything else acts in place, so no chevrons, except Edit details, which opens a form. -->
    <ul class="row-list details-rows">
      <li><button type="button" class="row" id="editDetails" onclick={() => ui.open('edit')}><Icon name="pencil" /><span class="row-label">{t('details.edit')}</span><Icon name="chevron-right" /></button></li>
      {#if highlights || bookmarks || doc.note?.trim()}<li><button type="button" class="row" onclick={() => void exportNotes()}><Icon name="file-down" /><span class="row-label">{t('details.exportNotes')}</span></button></li>{/if}
      {#if doc.location}<li><button type="button" class="row" onclick={() => void startOver()}><Icon name="rotate-ccw" /><span class="row-label">{t('details.startOver')}</span></button></li>{/if}
      {#if !doc.offloaded}<li><button type="button" class="row" onclick={() => void share()}><Icon name="share-2" /><span class="row-label">{t('details.shareFile')}</span></button></li>{/if}
      <li><button type="button" class="row" id="sendBookShelf" onclick={() => void bookShelf()}><Icon name="library" /><span class="row-label">{t('details.toBookShelf')}</span></button></li>
      {#if nookling && doc.finishedAt}<li><button type="button" class="row" id="sendNookling" onclick={() => void toNookling()}><Icon name="heart" /><span class="row-label">{t('details.toNookling')}</span></button></li>{/if}
      {#if doc.format === 'epub' && !doc.offloaded}<li><button type="button" class="row" id="openColophon" onclick={() => void colophon()}><Icon name="file-code" /><span class="row-label">{t('details.toColophon')}</span></button></li>{/if}
      {#if !doc.offloaded}<li><button type="button" class="row" id="offloadDoc" onclick={() => void offload()}><Icon name="hard-drive" /><span class="row-label">{t('details.offload')}</span></button></li>{/if}
    </ul>
    <button type="button" class="row row-danger" id="removeDoc" onclick={() => void remove()}><Icon name="trash-2" /><span class="row-label">{t('action.remove')}</span></button>
  </Sheet>
{/if}

<style>
  /* Details */
  /* Book details (DetailsSheet): cover and how far through, the one button to
     read it, the facts, then the rest as rows and Remove alone at the end. */
  .details-head {
    display: flex;
    gap: var(--space-4);
    align-items: flex-start;
  }
  .details-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .details-title {
    margin: 0;
    font-family: var(--font-serif);
    font-weight: 400;
    font-size: 1.375rem;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: var(--text-heading);
    overflow-wrap: anywhere;
  }
  .details-author {
    margin: 0;
    color: var(--text-body);
  }
  .details-state {
    margin: var(--space-1) 0 0;
  }
  .details-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
    gap: var(--space-2);
  }
  .details-note {
    margin: 0;
  }
  .details-note .textarea {
    min-height: 4.5rem;
    resize: vertical;
  }
  .details-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
    gap: var(--space-3) var(--space-4);
    margin: 0;
  }
  .details-facts dd {
    margin: 2px 0 0;
    color: var(--text-heading);
  }
  .details-file {
    margin-top: calc(-1 * var(--space-2));
  }
  .row-label {
    flex: 1;
    min-width: 0;
  }
  .row-danger,
  .row-danger > :global(svg:first-child) {
    color: var(--danger);
  }
  .details-tags {
    margin-top: var(--space-3);
  }

  /* The next volume, from a document's details: a row that opens it. */
  .details-next {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px var(--space-3);
    width: 100%;
    margin-bottom: var(--space-4);
    padding: var(--space-3) var(--space-2);
    text-align: left;
    border-top: 1px solid var(--border-faint);
    border-bottom: 1px solid var(--border-faint);
    transition: background-color var(--dur-hover);
  }
  .details-next:hover {
    background: var(--hover-bg);
  }
  .details-next > :global(svg) {
    grid-row: 1 / span 2;
    grid-column: 2;
    width: 18px;
    height: 18px;
    color: var(--text-faint);
  }
  .details-next-title {
    font-family: var(--font-serif);
    font-size: 1.0625rem;
    color: var(--text-heading);
  }
</style>
