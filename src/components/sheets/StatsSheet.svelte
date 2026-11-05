<script lang="ts">
  // Reading stats: today against the day's goal, the streak, the week, a
  // calendar of the last few months, what took the most time, and what's
  // finished. Figures only, in the stat-tile and bar-list patterns
  // (style.md §8.15).
  import { locale, t } from '../../i18n/index.svelte';
  import { duration } from '../../lib/format';
  import { library } from '../../state/library.svelte';
  import { DAILY_GOALS } from '../../state/settings';
  import { settings } from '../../state/settings.svelte';
  import { calendarWeeks, dayKey, stats, type Summary } from '../../state/stats.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { onclose }: { onclose: () => void } = $props();
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
</script>

<Sheet title={t('stats.title')} {onclose}>
  {#if summary}
    <div class="stat-grid">
      <div class="stat-tile"><span class="stat-value" id="statToday">{duration(summary.todayMs)}</span><span class="t-field-label">{t('stats.today')}</span></div>
      <div class="stat-tile"><span class="stat-value" id="statStreak">{t('stats.days', { count: summary.streak })}</span><span class="t-field-label">{t('stats.streak')}</span></div>
      <div class="stat-tile"><span class="stat-value" id="statLongest">{t('stats.days', { count: Math.max(summary.longest, summary.streak) })}</span><span class="t-field-label">{t('stats.longest')}</span></div>
      <div class="stat-tile"><span class="stat-value">{finishedThisYear.length}</span><span class="t-field-label">{t('stats.finishedYear', { year })}</span></div>
      <div class="stat-tile"><span class="stat-value">{Math.round(summary.pace / 6)}</span><span class="t-field-label">{t('stats.pace')}</span></div>
      <div class="stat-tile"><span class="stat-value">{duration(summary.totalMs)}</span><span class="t-field-label">{t('stats.allTime')}</span></div>
    </div>

    <section class="settings-group">
      <h3 class="t-section-label" id="goalLabel">{t('stats.goal')}</h3>
      {#if goal}
        <div class="goal-figure">
          <div class="meter" role="meter" aria-labelledby="goalLabel" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(goal, Math.floor(summary.todayMs / 60_000))}>
            <div class="meter-fill" class:is-complete={goalShare >= 1} style:transform="scaleX({goalShare})"></div>
          </div>
          <p class="t-data-small tabular dim" id="goalStatus">
            {goalShare >= 1 ? t('stats.goalDone', { time: duration(summary.todayMs) }) : t('stats.goalToday', { done: Math.floor(summary.todayMs / 60_000), goal })}
          </p>
        </div>
      {/if}
      <div class="segmented" role="radiogroup" aria-labelledby="goalLabel">
        {#each DAILY_GOALS as minutes (minutes)}
          <button type="button" role="radio" aria-checked={goal === minutes} data-goal={minutes} onclick={() => void settings.update({ dailyGoal: minutes })}>
            {minutes ? t('time.minutes', { count: minutes }) : t('stats.goalOff')}
          </button>
        {/each}
      </div>
      <p class="t-hint">{t('stats.goalHint')}</p>
    </section>

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
</Sheet>
