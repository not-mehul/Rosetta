<script lang="ts">
  // OPDS catalogs: Project Gutenberg, Standard Ebooks, or any catalog by its
  // address (a Calibre server, a library). Browse, search and download.
  import { LoadingIndicator } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import { CatalogAuthError, catalogFrom, downloadName, fetchBytes, fetchText, fillSearch, parseFeed, PRESETS, searchTemplate, SORT_GROUP, type Catalog, type Feed, type FeedEntry, type FeedFacet, type FeedLink } from '../../lib/opds';
  import { library } from '../../state/library.svelte';
  import { reader } from '../../state/reader.svelte';
  import CatalogCover from './CatalogCover.svelte';
  import { addFiles } from '../../state/intake';
  import { settings } from '../../state/settings.svelte';
  import { ui } from '../../state/ui.svelte';
  import Icon from '../ui/Icon.svelte';

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

  /** push: a new feed (Back returns); more: the next page, added below; replace: the same feed narrowed or reordered. */
  type How = 'push' | 'more' | 'replace';

  async function load(url: string, how: How = 'push', retried = false) {
    if (!catalog) return;
    loading = true;
    error = '';
    try {
      const feed = parseFeed(await fetchText(url, catalog), url);
      if (how === 'push' || !stack.length) stack = [...stack, { url, feed }];
      else if (how === 'replace') stack = [...stack.slice(0, -1), { url, feed }];
      else stack = [...stack.slice(0, -1), { url, feed: { ...feed, entries: [...(stack.at(-1)?.feed.entries ?? []), ...feed.entries] } }];
      if (feed.search && !template) {
        try {
          template = searchTemplate(/\{(searchTerms|\?)/.test(feed.search) ? feed.search : await fetchText(feed.search, catalog), url);
        } catch {
          template = null;
        }
      }
    } catch (err) {
      // A private catalog (a Calibre server with accounts) asks for its sign-in only when it needs it.
      if (err instanceof CatalogAuthError && !retried && (await signIn())) {
        loading = false;
        return load(url, how, true);
      }
      error = t('catalog.failed', { reason: err instanceof Error ? err.message : String(err) });
    } finally {
      loading = false;
    }
  }

  /** Asks for the catalog's user name, then its password, and keeps them with it. False when cancelled. */
  async function signIn(): Promise<boolean> {
    const c = catalog;
    if (!c || PRESETS.some((p) => p.id === c.id)) return false;
    const user = await ui.prompt({ title: t('catalog.signIn', { name: c.name }), message: t('catalog.signInNeeded'), label: t('catalog.user'), action: t('catalog.next'), value: c.user ?? '' });
    if (!user?.trim()) return false;
    const password = await ui.prompt({ title: t('catalog.signIn', { name: c.name }), message: '', label: t('catalog.password'), action: t('catalog.signInAction'), secret: true });
    if (password === null) return false;
    const signed = { ...c, user: user.trim(), password };
    await settings.update({ catalogs: settings.value.catalogs.map((x) => (x.id === c.id ? signed : x)) });
    catalog = signed;
    return true;
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
    const added = catalogFrom(url);
    if (!added) {
      ui.notify(t('catalog.badAddress'), 'error');
      return;
    }
    await settings.update({ catalogs: [...settings.value.catalogs, { id: crypto.randomUUID(), ...added }] });
  }

  async function removeCatalog(id: string) {
    await settings.update({ catalogs: settings.value.catalogs.filter((c) => c.id !== id) });
  }

  /** The feed's facets by group, sorts first as "Order". */
  const facetGroups = $derived.by(() => {
    const groups: [string, FeedFacet[]][] = [];
    for (const f of current?.facets ?? []) {
      const g = groups.find(([name]) => name === f.group);
      if (g) g[1].push(f);
      else groups.push([f.group, [f]]);
    }
    return groups.sort(([a], [b]) => (a === SORT_GROUP ? -1 : b === SORT_GROUP ? 1 : 0)).map(([group, facets]) => ({ name: group === SORT_GROUP ? t('catalog.order') : group || t('catalog.show'), facets }));
  });

  /** A book already in the library, by its title and (when both have one) its author. */
  const squash = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^(the|a|an)\s+/, '')
      .replace(/[^a-z0-9]+/g, '');
  const owned = $derived(new Map(library.items.map((d) => [squash(d.title), d])));
  function inLibrary(entry: FeedEntry) {
    const doc = owned.get(squash(entry.title));
    if (!doc || !squash(entry.title)) return null;
    const a = squash(entry.author);
    const b = squash(doc.author);
    return !a || !b || a.includes(b) || b.includes(a) ? doc : null;
  }

  const label = (l: FeedLink) =>
    /epub/.test(l.type) ? 'EPUB' : /pdf/.test(l.type) ? 'PDF' : /fb2|fiction/.test(l.type) ? 'FB2' : /cbz|comic/.test(l.type) ? 'CBZ' : /mobi|amazon/.test(l.type) ? 'Kindle' : /html/.test(l.type) ? 'HTML' : t('catalog.text');

  // Inside a catalog, Android's Back (and Escape) goes up one feed before it closes the sheet.
  const inside = $derived(!!catalog);
  $effect(() => {
    if (!inside) return;
    return ui.pushOverlay(back);
  });
</script>

<div class="section-view" id="view-catalogs" role="tabpanel" aria-labelledby="tab-catalogs">
  {#if !catalog}
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
    <div class="catalog-head">
      <button type="button" class="btn-icon" id="catalogBack" aria-label={t('catalog.back')} onclick={back}><Icon name="arrow-left" /></button>
      <h2 class="t-card-title ellipsis">{current?.title || catalog.name}</h2>
    </div>
    {#if template}
      <form
        class="filter-field catalog-search"
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
    {#each facetGroups as group (group.name)}
      <div class="facet-group" role="group" aria-label={group.name}>
        <span class="t-section-label">{group.name}</span>
        <div class="chip-row facet-row">
          {#each group.facets as f (f.href)}
            <button type="button" class="chip" aria-pressed={f.active} disabled={loading} onclick={() => void load(f.href, 'replace')}>{f.title}{#if f.count !== null}<span class="facet-count tabular">{f.count}</span>{/if}</button>
          {/each}
        </div>
      </div>
    {/each}
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
              {@const have = inLibrary(entry)}
              <div class="catalog-book">
                <CatalogCover url={entry.thumbnail} {catalog} id={entry.id} title={entry.title} author={entry.author} />
                <div class="catalog-book-body">
                  <span class="row-title">{entry.title}</span>
                  {#if entry.author}<span class="row-sub">{entry.author}</span>{/if}
                  {#if entry.summary}<span class="t-hint ellipsis-3">{entry.summary}</span>{/if}
                  <div class="btn-row btn-row-start">
                    {#if have}
                      <span class="in-library t-data-small"><Icon name="check" />{t('catalog.inLibrary')}</span>
                      <button type="button" class="btn btn-secondary" onclick={() => void reader.open(have.id)}><Icon name="book-open" />{t('catalog.read')}</button>
                    {:else}
                      {#each entry.downloads.slice(0, 2) as link (link.href)}
                        <button type="button" class="btn btn-secondary" disabled={downloading === entry.id} onclick={() => void download(entry, link)}><Icon name="download" />{label(link)}</button>
                      {:else}
                        <span class="t-hint">{t('catalog.nothingToRead')}</span>
                      {/each}
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      {#if current.next}
        <div class="btn-row"><button type="button" class="btn btn-muted" disabled={loading} onclick={() => void load(current.next!, 'more')}>{t('catalog.more')}</button></div>
      {/if}
    {/if}
    {#if loading}<div class="catalog-loading"><LoadingIndicator label={t('catalog.loading')} size={40} /></div>{/if}
  {/if}
</div>

<style>
  .catalog-loading {
    display: flex;
    justify-content: center;
    padding: var(--space-5) 0;
  }

  .catalog-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }
  /* In a column, the shared field's flex basis would become its height. */
  .catalog-search {
    flex: none;
  }
  .facet-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-3);
  }
  /* One row that scrolls sideways, rather than a wall of chips. */
  .facet-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0 calc(-1 * var(--space-5));
    padding: 0 var(--space-5) var(--space-1);
  }
  .facet-count {
    margin-left: var(--space-1);
    color: var(--text-faint);
  }
  .catalog-book {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-2) 0;
  }
  .catalog-book-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
  }
  .in-library {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--text-dim);
  }
  .in-library :global(svg) {
    width: 16px;
    height: 16px;
    color: var(--accent-sage);
  }
  .catalog-entry {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--border-faint);
  }
</style>
