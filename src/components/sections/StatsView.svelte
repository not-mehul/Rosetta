<script lang="ts">
  import { countUp } from 'dusk-dawn';
  // The Stats section: today against the day's goal, the streak, the week, a
  // calendar of the last few months, what took the most time, and what's
  // finished. Figures only, in the stat-tile and bar-list patterns
  // (style.md §8.15).
  import { locale, t } from '../../i18n/index.svelte';
  import { duration } from '../../lib/format';
  import { library } from '../../state/library.svelte';
    import { settings } from '../../state/settings.svelte';
  import { ui } from '../../state/ui.svelte';
  import { calendarWeeks, dayKey, stats, type Summary } from '../../state/stats.svelte';

  let summary = $state.raw<Summary | null>(null);
  $effect(() => {
    void stats.summary().then((s) => (summary = s));
  });

  /** About four months: enough to see a habit, small enough for a phone. */
  const WEEKS = 18;

  const year = new Date().getFullYear();
  const goal = $derived(settings.value.dailyGoal);
  const finishedThisYear = $derived(library.items.filter((d) => d.finishedAt && new Date(d.finishedAt).getFullYear() === year));
  const most = $derived(summary ? Math.max(1, ...summary.week.map((d) => d.ms)) : 1);
  const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short' });
  const longDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });

  const weeks = $derived(summary ? calendarWeeks(summary.byDay, WEEKS) : []);
  const days = $derived(weeks.flat());
  const daysRead = $derived(days.filter((d) => d.ms > 0).length);
  const daysSoFar = $derived(days.filter((d) => !d.future).length);
  /** A month's short name over the first week that starts in it. */
  const months = $derived(
    weeks.map((w, i) => {
      const month = w[0]!.day.slice(0, 7);
      return i === 0 || month !== weeks[i - 1]![0]!.day.slice(0, 7) ? new Date(`${w[0]!.day}T12:00:00`).toLocaleDateString(locale(), { month: 'short' }) : '';
    }),
  );
  let picked = $state(dayKey());
  const pickedDay = $derived(days.find((d) => d.day === picked));

  function onCalendarKey(e: KeyboardEvent) {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = days.findIndex((d) => d.day === picked);
    const next = days[Math.max(0, Math.min(days.length - 1, i + step))];
    if (!next || next.future) return;
    picked = next.day;
    (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLButtonElement>(`[data-day="${next.day}"]`)?.focus();
  }

  /** The documents that took the most time, by title; removed ones drop out. */
  const mostRead = $derived(
    (summary?.byDoc ?? [])
      .map((r) => ({ ...r, doc: library.get(r.docId) }))
      .filter((r) => r.doc && r.ms >= 60_000)
      .slice(0, 5),
  );
  const mostMs = $derived(mostRead[0]?.ms ?? 1);
  const goalShare = $derived(summary && goal ? Math.min(1, summary.todayMs / (goal * 60_000)) : 0);
  const yearGoal = $derived(settings.value.yearlyGoal);
  const yearShare = $derived(yearGoal ? Math.min(1, finishedThisYear.length / yearGoal) : 0);
  /** Where the year's goal would have you by today, in books. */
  const onPace = $derived.by(() => {
    const start = new Date(year, 0, 1).getTime();
    const end = new Date(year + 1, 0, 1).getTime();
    return Math.floor((yearGoal * (Date.now() - start)) / (end - start));
  });
</script>

<div class="section-view" id="view-stats" role="tabpanel" aria-labelledby="tab-stats">
  {#if summary}
    <div class="stat-grid">
      <div class="stat-tile"><span class="stat-value" id="statToday">{duration(summary.todayMs)}</span><span class="t-field-label">{t('stats.today')}</span></div>
      <div class="stat-tile"><span class="stat-value" id="statStreak">{t('stats.days', { count: summary.streak })}</span><span class="t-field-label">{t('stats.streak')}</span></div>
      <div class="stat-tile"><span class="stat-value" id="statLongest">{t('stats.days', { count: Math.max(summary.longest, summary.streak) })}</span><span class="t-field-label">{t('stats.longest')}</span></div>
      <div class="stat-tile"><span class="stat-value tabular" use:countUp={{ value: finishedThisYear.length }}>{finishedThisYear.length}</span><span class="t-field-label">{t('stats.finishedYear', { year })}</span></div>
      <div class="stat-tile">{#if summary.paceMeasured}<span class="stat-value tabular" use:countUp={{ value: Math.round(summary.pace / 6) }}>{Math.round(summary.pace / 6)}</span>{:else}<span class="stat-value">—</span>{/if}<span class="t-field-label">{t('stats.pace')}</span></div>
      <div class="stat-tile"><span class="stat-value">{duration(summary.totalMs)}</span><span class="t-field-label">{t('stats.allTime')}</span></div>
    </div>

    <!-- Goals are set in Settings → General; here, how far along they are. -->
    {#if goal || yearGoal}
      <section class="settings-group goals">
        {#if goal}
          <div class="goal-figure">
            <h3 class="t-section-label" id="goalLabel">{t('stats.goal')}</h3>
            <div class="meter" role="meter" aria-labelledby="goalLabel" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, Math.floor(summary.todayMs / 60_000))}>
              <div class="meter-fill" class:is-complete={goalShare >= 1} style:transform="scaleX({goalShare})"></div>
            </div>
            <p class="t-data-small tabular dim" id="goalStatus">
              {goalShare >= 1 ? t('stats.goalDone', { time: duration(summary.todayMs) }) : t('stats.goalToday', { done: Math.floor(summary.todayMs / 60_000), goal })}
            </p>
          </div>
        {/if}
        {#if yearGoal}
          <div class="goal-figure">
            <h3 class="t-section-label" id="yearGoalLabel">{t('stats.yearGoal', { year })}</h3>
            <div class="meter" role="meter" aria-labelledby="yearGoalLabel" aria-valuemin={0} aria-valuemax={yearGoal} aria-valuenow={Math.min(yearGoal, finishedThisYear.length)}>
              <div class="meter-fill" class:is-complete={yearShare >= 1} style:transform="scaleX({yearShare})"></div>
            </div>
            <p class="t-data-small tabular dim" id="yearGoalStatus">
              {yearShare >= 1 ? t('stats.yearGoalDone', { count: finishedThisYear.length }) : t('stats.yearGoalSoFar', { done: finishedThisYear.length, goal: yearGoal, pace: onPace })}
            </p>
          </div>
        {/if}
      </section>
    {:else}
      <div class="goal-none">
        <p class="t-hint">{t('stats.noGoals')}</p>
        <button
          type="button"
          class="btn btn-muted"
          id="setGoals"
          onclick={() => {
            ui.settingsTab = 'general';
            ui.open('settings');
          }}>{t('stats.setGoals')}</button
        >
      </div>
    {/if}

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
    </section>

    <section class="settings-group">
      <h3 class="t-section-label" id="calendarLabel">{t('stats.calendar')}</h3>
      <div class="calendar" style:--weeks={WEEKS}>
        <div class="calendar-months" aria-hidden="true">
          {#each months as m, i (i)}<span class="t-field-label">{m}</span>{/each}
        </div>
        <!-- One button per day, with arrow keys between them; only the picked day is a tab stop. -->
        <div class="calendar-days" role="group" aria-labelledby="calendarLabel" aria-describedby="calendarSummary">
          {#each days as d (d.day)}
            <button
              type="button"
              class="calendar-day level-{d.level}"
              class:is-today={d.day === dayKey()}
              class:is-future={d.future}
              data-day={d.day}
              tabindex={d.day === picked ? 0 : -1}
              disabled={d.future}
              aria-pressed={d.day === picked}
              aria-label={`${longDay(d.day)}: ${duration(d.ms)}`}
              onclick={() => (picked = d.day)}
              onkeydown={onCalendarKey}
            ></button>
          {/each}
        </div>
        <div class="calendar-foot">
          <p class="t-data-small tabular" id="calendarPicked">{#if pickedDay}<span class="dim">{longDay(pickedDay.day)}</span> · {duration(pickedDay.ms)}{/if}</p>
          <p class="calendar-legend t-field-label" aria-hidden="true">
            {t('stats.less')}
            {#each [0, 1, 2, 3, 4] as l (l)}<span class="calendar-day level-{l}"></span>{/each}
            {t('stats.more')}
          </p>
        </div>
      </div>
      <p class="t-hint" id="calendarSummary">{t('stats.calendarSummary', { count: daysRead, total: daysSoFar })}</p>
    </section>

    {#if mostRead.length}
      <section class="settings-group">
        <h3 class="t-section-label">{t('stats.mostRead')}</h3>
        <ul class="most-list">
          {#each mostRead as r (r.docId)}
            <li>
              <span class="most-title ellipsis">{r.doc!.title}</span>
              <span class="t-data-small tabular bar-value">{duration(r.ms)}</span>
              <span class="bar-track"><span class="bar-fill" style:transform="scaleX({r.ms / mostMs})"></span></span>
              <span class="t-data-small dim most-days">{t('stats.overDays', { days: t('stats.days', { count: r.days }) })}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

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
</div>

<style>
  /* ─── Stats (style.md §8.15) ────────────────────────────────── */

  .stat-grid {
    /* In the sheet's flex column, overflow: hidden would let it shrink to its border. */
    flex-shrink: 0;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1px;
    background: var(--border-soft);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .stat-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-4) var(--space-2);
    background: var(--sheet-bg);
    text-align: center;
  }
  .stat-value {
    font-family: var(--font-serif);
    font-size: 1.6rem;
    color: var(--text-heading);
    font-variant-numeric: tabular-nums;
  }
  .bar-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .bar-list li {
    display: grid;
    grid-template-columns: 3.5rem 1fr 4.5rem;
    align-items: center;
    gap: var(--space-3);
  }
  .bar-label {
    color: var(--text-dim);
    font-size: 0.85rem;
  }
  .bar-track {
    height: 4px;
    border-radius: var(--corner-full);
    background: var(--chart-track);
    overflow: hidden;
  }
  .bar-fill {
    display: block;
    height: 100%;
    background: var(--series-1);
    transform-origin: left;
  }
  .bar-value {
    text-align: right;
    color: var(--text-muted);
  }
  .goals {
    gap: var(--space-5);
  }
  .goal-figure {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .goal-none {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
  }
  .calendar-months,
  .calendar-days {
    display: grid;
    grid-template-columns: repeat(var(--weeks), minmax(0, 1fr));
    gap: 3px;
  }
  .calendar-months {
    min-height: 1rem;
  }
  .calendar-months > span {
    overflow: visible;
    white-space: nowrap;
  }
  .calendar-days {
    grid-template-rows: repeat(7, auto);
    grid-auto-flow: column;
  }
  .calendar-days:focus {
    outline: none;
  }
  .calendar-day {
    display: block;
    aspect-ratio: 1;
    min-width: 0;
    padding: 0;
    border-radius: var(--radius);
    background: var(--chart-track);
  }
  .calendar-day.is-future {
    background: transparent;
  }
  .calendar-day.is-today {
    box-shadow: inset 0 0 0 1px var(--text-dim);
  }
  .calendar-day[aria-pressed='true'] {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
  }
  .calendar-foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2) var(--space-4);
  }
  .calendar-foot p {
    margin: 0;
  }
  .calendar-legend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .calendar-legend .calendar-day {
    width: 10px;
  }
  .calendar-legend .calendar-day:first-child {
    margin-left: var(--space-1);
  }
  .calendar-legend .calendar-day:last-of-type {
    margin-right: var(--space-1);
  }

  /* Most read: a title, its time, and a bar that compares it with the first. */
  .most-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .most-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-1) var(--space-3);
    align-items: center;
  }
  .most-title {
    font-family: var(--font-serif);
    color: var(--text-heading);
  }
  .most-days {
    text-align: right;
  }
</style>
