// When to remind: once a day at the chosen time, for the next week, leaving
// out today once its reading is done (or its time has gone). They are set
// again each time Rosetta is opened or put away, so a day read ahead of the
// time is never nagged, and a week away still gets its reminders.

/** How many days ahead reminders are set. */
export const REMINDER_DAYS = 7;

/** The moments to remind at, from `now`: each day at `time` ("HH:MM"). */
export function reminderTimes(now: Date, time: string, doneToday: boolean, days = REMINDER_DAYS): Date[] {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const out: Date[] = [];
  for (let i = 0; out.length < days && i <= days; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m, 0, 0);
    if (i === 0 && (doneToday || at <= now)) continue;
    out.push(at);
  }
  return out.slice(0, days);
}

/** Whether today's reading is done: the goal met, or with no goal, any reading at all. */
export function readingDone(todayMs: number, dailyGoal: number): boolean {
  return dailyGoal ? todayMs >= dailyGoal * 60_000 : todayMs >= 60_000;
}
