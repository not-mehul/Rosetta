<script lang="ts">
  // Reading stats: time today and this week, the streak, what's finished.
  // Figures only, in the stat-tile and bar-list patterns (style.md §8.15).
  import { locale, t } from '../../i18n/index.svelte';
  import { duration } from '../../lib/format';
  import { library } from '../../state/library.svelte';
  import { stats, type Summary } from '../../state/stats.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();
  let summary = $state.raw<Summary | null>(null);
  $effect(() => {
    void stats.summary().then((s) => (summary = s));
  });

  const year = new Date().getFullYear();
  const finishedThisYear = $derived(library.items.filter((d) => d.finishedAt && new Date(d.finishedAt).getFullYear() === year));
  const most = $derived(summary ? Math.max(1, ...summary.week.map((d) => d.ms)) : 1);
  const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short' });
</script>

<Sheet title={t('stats.title')} {onclose}>
  {#if summary}
    <div class="stat-grid">
      <div class="stat-tile"><span class="stat-value" id="statToday">{duration(summary.todayMs)}</span><span class="t-field-label">{t('stats.today')}</span></div>
      <div class="stat-tile"><span class="stat-value">{t('stats.days', { count: summary.streak })}</span><span class="t-field-label">{t('stats.streak')}</span></div>
      <div class="stat-tile"><span class="stat-value">{finishedThisYear.length}</span><span class="t-field-label">{t('stats.finishedYear', { year })}</span></div>
      <div class="stat-tile"><span class="stat-value">{Math.round(summary.pace / 6)}</span><span class="t-field-label">{t('stats.pace')}</span></div>
    </div>

    <section class="settings-group">
      <h3 class="t-section-label">{t('stats.week')}</h3>
      <ul class="bar-list">
        {#each summary.week as d (d.day)}
          <li>
            <span class="bar-label">{weekday(d.day)}</span>
            <span class="bar-track"><span class="bar-fill" style:transform="scaleX({d.ms / most})"></span></span>
            <span class="t-data-small tabular bar-value">{duration(d.ms)}</span>
          </li>
        {/each}
      </ul>
      <p class="t-hint">{t('stats.total', { time: duration(summary.totalMs) })}</p>
    </section>

    {#if finishedThisYear.length}
      <section class="settings-group">
        <h3 class="t-section-label">{t('stats.finishedList')}</h3>
        <ul class="row-list">
          {#each finishedThisYear.sort((a, b) => b.finishedAt! - a.finishedAt!) as d (d.id)}
            <li class="row"><span class="row-main"><span class="row-title">{d.title}</span>{#if d.author}<span class="row-sub">{d.author}</span>{/if}</span></li>
          {/each}
        </ul>
      </section>
    {/if}
    <p class="t-hint"><em>{t('stats.noteTerm')}</em> {t('stats.note')}</p>
  {/if}
</Sheet>
