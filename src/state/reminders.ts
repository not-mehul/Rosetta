// The reading reminder, kept in step with the settings and today's reading.
// Called when Rosetta opens, when it is put away, and when the reminder or
// the daily goal changes.

import { t } from '../i18n/index.svelte';
import { readingDone, reminderTimes } from '../lib/reminders';
import { allowReminders, cancelReminders, setReminders } from '../platform/reminders';
import { isReading, library, shelve } from './library.svelte';
import { settings } from './settings.svelte';
import { stats } from './stats.svelte';

export async function refreshReminders(now = new Date()): Promise<void> {
  const s = settings.value;
  if (!s.reminder) return cancelReminders();
  const book = shelve(library.items.filter(isReading), 'reading', 'recent')[0];
  const body = book ? t('reminder.bodyBook', { title: book.title }) : s.dailyGoal ? t('reminder.bodyGoal', { count: s.dailyGoal }) : t('reminder.body');
  await setReminders(reminderTimes(now, s.reminderTime, readingDone(stats.todayMs, s.dailyGoal)), t('reminder.title'), body);
}

/** Turns the reminder on or off; on asks for notifications first. False when they were refused. */
export async function setReminder(on: boolean): Promise<boolean> {
  if (on && !(await allowReminders(t('reminder.channel')))) {
    await settings.update({ reminder: false });
    return false;
  }
  await settings.update({ reminder: on });
  await refreshReminders();
  return true;
}
