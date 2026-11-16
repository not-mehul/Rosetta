<script lang="ts">
  // Home: the editorial header (style.md §8.8) and the four top-level
  // sections as icon tabs under it (§8.5.1), as in Ledger, Mise and Colophon:
  // Library, Notes, Stats and Catalogs. Settings is a sheet from the header.
  import { IconTabs, ThemeToggle, konami, play, secretTaps } from 'dusk-dawn';
  import type { Snippet } from 'svelte';
  import { t, type MessageKey } from '../i18n/index.svelte';
  import { hatch } from '../lib/delight';
  import { shown, toggledTheme } from '../platform/theme.svelte';
  import { library } from '../state/library.svelte';
  import { settings } from '../state/settings.svelte';
  import { ui, type Section } from '../state/ui.svelte';
  import LibraryView from './LibraryView.svelte';
  import CatalogView from './sections/CatalogView.svelte';
  import NotesView from './sections/NotesView.svelte';
  import StatsView from './sections/StatsView.svelte';
  import Icon from './ui/Icon.svelte';

  /** Each section's header: eyebrow, a title with one italic word, and a tagline. */
  const HEAD: Record<Section, { eyebrow: MessageKey; before: MessageKey; em: MessageKey; after: MessageKey; tagline: MessageKey }> = {
    library: { eyebrow: 'library.eyebrow', before: 'library.titleBefore', em: 'library.titleEm', after: 'library.titleAfter', tagline: 'library.tagline' },
    notes: { eyebrow: 'notes.eyebrow', before: 'notes.titleBefore', em: 'notes.titleEm', after: 'notes.titleAfter', tagline: 'notes.tagline' },
    stats: { eyebrow: 'stats.eyebrow', before: 'stats.titleBefore', em: 'stats.titleEm', after: 'stats.titleAfter', tagline: 'stats.tagline' },
    catalogs: { eyebrow: 'catalog.eyebrow', before: 'catalog.titleBefore', em: 'catalog.titleEm', after: 'catalog.titleAfter', tagline: 'catalog.intro' },
  };
  const head = $derived(HEAD[ui.section]);

  const TABS: { id: Section; label: MessageKey; icon: Snippet }[] = [
    { id: 'library', label: 'sections.library', icon: libraryIcon },
    { id: 'notes', label: 'sections.notes', icon: notesIcon },
    { id: 'stats', label: 'sections.stats', icon: statsIcon },
    { id: 'catalogs', label: 'sections.catalogs', icon: catalogsIcon },
  ];
  const tabs = $derived(TABS.map((tab) => ({ id: tab.id, label: t(tab.label), icon: tab.icon, domId: `tab-${tab.id}`, controls: `view-${tab.id}` })));

  // Easter eggs (style.md §11.3). The Konami code reads the title's word off
  // the stone in Greek and Latin before coming home; seven taps on the title
  // dust the shelves.
  let script = $state<string | null>(null);
  let scriptWord = $state<HTMLElement>();
  $effect(() =>
    konami(() => {
      if (ui.section !== 'library') ui.go('library');
      const words = ['ἀνάγνωσις', 'lectio', null];
      words.forEach((word, i) =>
        setTimeout(() => {
          script = word;
          if (scriptWord) play(scriptWord, 'flip');
        }, i * 900),
      );
      hatch('konami', t('egg.konami'));
    }),
  );
  function dust() {
    if (ui.section !== 'library') return;
    for (const [i, el] of [...document.querySelectorAll('.doc-list > li')].slice(0, 24).entries()) setTimeout(() => play(el, 'jelly'), 50 * i);
    hatch('title', t('egg.title'));
  }
</script>

{#snippet libraryIcon()}<Icon name="library" />{/snippet}
{#snippet notesIcon()}<Icon name="highlighter" />{/snippet}
{#snippet statsIcon()}<Icon name="chart-column" />{/snippet}
{#snippet catalogsIcon()}<Icon name="globe" />{/snippet}

<div class="container">
  <header class="site-header">
    <div class="site-title">
      <p class="eyebrow">{t(head.eyebrow)}</p>
      <h1 class="t-page-title" use:secretTaps={{ count: 7, onunlock: dust }}>
        {t(head.before)}<em class="script-word" bind:this={scriptWord}>{ui.section === 'library' ? (script ?? t(head.em)) : t(head.em)}</em>{t(head.after)}
      </h1>
      <!-- The library's tagline says what Rosetta is; once there are books, the books say it. -->
      {#if ui.section !== 'library' || !library.items.length}<p class="t-tagline">{t(head.tagline)}</p>{/if}
    </div>
    <div class="header-tools">
      <button type="button" class="btn-icon" id="openSettings" aria-label={t('settings.title')} onclick={() => ui.open('settings')}><Icon name="settings" /></button>
      <ThemeToggle dawn={!shown.dark} label={t('library.dawn')} ontoggle={() => void settings.update({ theme: toggledTheme() })} />
    </div>
  </header>

  <nav class="app-tabs" aria-label={t('sections.label')}>
    <IconTabs {tabs} value={ui.section} label={t('sections.label')} onselect={(id) => ui.go(id)} />
  </nav>

  {#if ui.section === 'library'}
    <LibraryView />
  {:else if ui.section === 'notes'}
    <NotesView />
  {:else if ui.section === 'stats'}
    <StatsView />
  {:else}
    <CatalogView />
  {/if}
</div>
