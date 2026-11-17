<script lang="ts">
  // Home: Rosetta's name with a line under it about the section on screen,
  // Settings at the top right, and the three sections as icon tabs under
  // them (style.md §8.5.1): Library, Notes and Stats.
  import { IconTabs, konami, play, secretTaps } from 'dusk-dawn';
  import type { Snippet } from 'svelte';
  import { t, type MessageKey } from '../i18n/index.svelte';
  import { hatch } from '../lib/delight';
  import { ui, type Section } from '../state/ui.svelte';
  import LibraryView from './LibraryView.svelte';
  import NotesView from './sections/NotesView.svelte';
  import StatsView from './sections/StatsView.svelte';
  import Icon from './ui/Icon.svelte';

  /** The line under the name: what the section on screen holds. */
  const TAGLINE: Record<Section, MessageKey> = {
    library: 'library.tagline',
    notes: 'notes.tagline',
    stats: 'stats.tagline',
  };

  const TABS: { id: Section; label: MessageKey; icon: Snippet }[] = [
    { id: 'library', label: 'sections.library', icon: libraryIcon },
    { id: 'notes', label: 'sections.notes', icon: notesIcon },
    { id: 'stats', label: 'sections.stats', icon: statsIcon },
  ];
  const tabs = $derived(TABS.map((tab) => ({ id: tab.id, label: t(tab.label), icon: tab.icon, domId: `tab-${tab.id}`, controls: `view-${tab.id}` })));

  // Easter eggs (style.md §11.3). The Konami code reads the name off the
  // stone in Greek and Latin before coming home; seven taps on the name dust
  // the shelves.
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
    for (const [i, el] of [...document.querySelectorAll('.doc-list > li, .doc-grid > li')].slice(0, 24).entries()) setTimeout(() => play(el, 'jelly'), 50 * i);
    hatch('title', t('egg.title'));
  }
</script>

{#snippet libraryIcon()}<Icon name="library" />{/snippet}
{#snippet notesIcon()}<Icon name="highlighter" />{/snippet}
{#snippet statsIcon()}<Icon name="chart-column" />{/snippet}

<div class="container">
  <header class="site-header">
    <div class="site-title">
      <h1 class="t-page-title" use:secretTaps={{ count: 7, onunlock: dust }}><span class="script-word" bind:this={scriptWord}>{script ?? 'Rosetta'}</span></h1>
      <p class="t-tagline" id="sectionTagline">{t(TAGLINE[ui.section])}</p>
    </div>
    <button type="button" class="btn-icon" id="openSettings" aria-label={t('settings.title')} onclick={() => ui.open('settings')}><Icon name="settings" /></button>
  </header>

  <nav class="app-tabs" aria-label={t('sections.label')}>
    <IconTabs {tabs} value={ui.section} label={t('sections.label')} onselect={(id) => ui.go(id)} />
  </nav>

  {#if ui.section === 'library'}
    <LibraryView />
  {:else if ui.section === 'notes'}
    <NotesView />
  {:else}
    <StatsView />
  {/if}
</div>

<style>
  /* ─── Header ─────────────────────────────────────────────────── */

  /* The name and its line on the left, Settings on the right of the name's
     row (style.md §8.8). The section tabs sit under it (§8.5.1). */
  .site-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }
  .site-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  .site-title h1 {
    margin: 0;
  }
  .site-title .t-tagline {
    margin: 0;
  }
  /* Level with the name's cap height rather than the top of its line box. */
  .site-header > .btn-icon {
    flex-shrink: 0;
    margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2)) 0 0;
  }

  .app-tabs {
    margin-bottom: var(--space-6);
  }

  /* The name that reads off the stone (an easter egg): flips in place. */
  .script-word {
    display: inline-block;
  }
</style>
