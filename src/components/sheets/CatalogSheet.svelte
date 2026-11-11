<script lang="ts">
  // OPDS catalogs: Project Gutenberg, Standard Ebooks, or any catalog by its
  // address (a Calibre server, a library). Browse, search and download.
  import { LoadingIndicator } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import { downloadName, fetchBytes, fetchText, fillSearch, parseFeed, PRESETS, searchTemplate, type Catalog, type Feed, type FeedEntry, type FeedLink } from '../../lib/opds';
  import { addFiles } from '../../state/intake';
  import { settings } from '../../state/settings.svelte';
  import { ui } from '../../state/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const catalogs = $derived<Catalog[]>([...PRESETS, ...settings.value.catalogs]);
  let catalog = $state.raw<Catalog | null>(null);
  /** The feeds opened, for Back. */
  let stack = $state.raw<{ url: string; feed: Feed }[]>([]);
  let loading = $state(false);
  let error = $state('');
  let query = $state('');
  let template = $state<string | null>(null);
  let downloading = $state<string | null>(null);
  const current = $derived(stack.at(-1)?.feed ?? null);

  async function load(url: string, push = true) {
    if (!catalog) return;
    loading = true;
    error = '';
    try {
      const feed = parseFeed(await fetchText(url, catalog), url);
      stack = push ? [...stack, { url, feed }] : [...stack.slice(0, -1), { url, feed: { ...feed, entries: [...(stack.at(-1)?.feed.entries ?? []), ...feed.entries] } }];
      if (feed.search && !template) {
        try {
          template = searchTemplate(feed.search.includes('{searchTerms}') ? feed.search : await fetchText(feed.search, catalog), url);
        } catch {
          template = null;
        }
      }
    } catch (err) {
      error = t('catalog.failed', { reason: err instanceof Error ? err.message : String(err) });
    } finally {
      loading = false;
    }
  }

  function openCatalog(c: Catalog) {
    catalog = c;
    stack = [];
    template = null;
    query = '';
    void load(c.url);
  }

  function back() {
    if (stack.length > 1) stack = stack.slice(0, -1);
    else {
      catalog = null;
      stack = [];
      error = '';
    }
  }

  async function download(entry: FeedEntry, link: FeedLink) {
    if (!catalog) return;
    downloading = entry.id;
    try {
      const bytes = await fetchBytes(link.href, catalog);
      await addFiles([{ name: downloadName(entry, link), bytes }]);
    } catch (err) {
      ui.notify(t('catalog.downloadFailed', { reason: err instanceof Error ? err.message : String(err) }), 'error');
    } finally {
      downloading = null;
    }
  }

  async function addCatalog() {
    const url = await ui.prompt({ title: t('catalog.add'), message: t('catalog.addHint'), label: t('catalog.address'), action: t('catalog.addAction') });
    if (!url?.trim()) return;
    let name: string;
    try {
      name = new URL(url.trim()).hostname;
    } catch {
      ui.notify(t('catalog.badAddress'), 'error');
      return;
    }
    await settings.update({ catalogs: [...settings.value.catalogs, { id: crypto.randomUUID(), name, url: url.trim() }] });
  }

  async function removeCatalog(id: string) {
    await settings.update({ catalogs: settings.value.catalogs.filter((c) => c.id !== id) });
  }

  const label = (l: FeedLink) => (/epub/.test(l.type) ? 'EPUB' : /pdf/.test(l.type) ? 'PDF' : /fb2|fiction/.test(l.type) ? 'FB2' : /cbz|comic/.test(l.type) ? 'CBZ' : /html/.test(l.type) ? 'HTML' : t('catalog.text'));
</script>

<Sheet title={catalog ? (current?.title || catalog.name) : t('catalog.title')} {onclose} wide>
  {#if !catalog}
    <p class="t-body-small dim">{t('catalog.intro')}</p>
    <ul class="row-list" id="catalogList">
      {#each catalogs as c (c.id)}
        <li class="row-with-action">
          <button type="button" class="row" onclick={() => openCatalog(c)}>
            <span class="row-main"><span class="row-title">{c.name}</span><span class="row-sub ellipsis">{c.url}</span></span>
            <Icon name="chevron-right" />
          </button>
          {#if !PRESETS.some((p) => p.id === c.id)}<button type="button" class="btn-icon" aria-label={t('catalog.remove', { name: c.name })} onclick={() => void removeCatalog(c.id)}><Icon name="x" /></button>{/if}
        </li>
      {/each}
    </ul>
    <div class="btn-row btn-row-start">
      <button type="button" class="btn btn-secondary" id="addCatalog" onclick={() => void addCatalog()}><Icon name="plus" />{t('catalog.add')}</button>
    </div>
    <p class="t-hint"><em>{t('catalog.noteTerm')}</em> {t('catalog.note')}</p>
  {:else}
    <div class="btn-row btn-row-start">
      <button type="button" class="btn btn-muted" id="catalogBack" onclick={back}><Icon name="chevron-left" />{t('catalog.back')}</button>
    </div>
    {#if template}
      <form
        class="filter-field"
        onsubmit={(e) => {
          e.preventDefault();
          if (query.trim() && template) void load(fillSearch(template, query.trim()));
        }}
      >
        <span class="visually-hidden">{t('catalog.search')}</span>
        <Icon name="search" />
        <input class="input" type="search" placeholder={t('catalog.search')} enterkeyhint="search" autocomplete="off" bind:value={query} />
      </form>
    {/if}
    {#if error}
      <p class="t-body-small danger" role="alert">{error}</p>
    {/if}
    {#if current}
      <ul class="row-list catalog-entries">
        {#each current.entries as entry (entry.id)}
          <li class="catalog-entry">
            {#if entry.feed}
              <button type="button" class="row" onclick={() => void load(entry.feed!.href)}>
                <span class="row-main"><span class="row-title">{entry.title}</span>{#if entry.summary}<span class="row-sub ellipsis-2">{entry.summary}</span>{/if}</span>
                <Icon name="chevron-right" />
              </button>
            {:else}
              <div class="row">
                <span class="row-main">
                  <span class="row-title">{entry.title}</span>
                  {#if entry.author}<span class="row-sub">{entry.author}</span>{/if}
                  {#if entry.summary}<span class="t-hint ellipsis-3">{entry.summary}</span>{/if}
                </span>
              </div>
              <div class="btn-row btn-row-start">
                {#each entry.downloads.slice(0, 2) as link (link.href)}
                  <button type="button" class="btn btn-secondary" disabled={downloading === entry.id} onclick={() => void download(entry, link)}><Icon name="download" />{label(link)}</button>
                {:else}
                  <span class="t-hint">{t('catalog.nothingToRead')}</span>
                {/each}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if current.next}
        <div class="btn-row"><button type="button" class="btn btn-muted" disabled={loading} onclick={() => void load(current.next!, false)}>{t('catalog.more')}</button></div>
      {/if}
    {/if}
    {#if loading}<div class="catalog-loading"><LoadingIndicator label={t('catalog.loading')} size={40} /></div>{/if}
  {/if}
</Sheet>

<style>
  .catalog-loading {
    display: flex;
    justify-content: center;
    padding: var(--space-5) 0;
  }
</style>
