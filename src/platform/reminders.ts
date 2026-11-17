// Reading reminders as local notifications (Android and iOS). Asking to post
// notifications happens when the reminder is turned on, not before. Nothing
// on the web: there is no app to wake.

import { LocalNotifications } from '@capacitor/local-notifications';
import { REMINDER_DAYS } from '../lib/reminders';
import { isNative } from './native';

const CHANNEL = 'reading';
/** One id a day, so setting them again replaces the last week's. */
const IDS = Array.from({ length: REMINDER_DAYS + 1 }, (_, i) => 7100 + i);

export const remindersAvailable = isNative;

/** Asks to post notifications if it hasn't been answered. True when they can be shown. */
export async function allowReminders(channelName: string): Promise<boolean> {
  if (!isNative) return false;
  try {
    await LocalNotifications.createChannel({ id: CHANNEL, name: channelName, importance: 3 }).catch(() => undefined);
    let { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') ({ display } = await LocalNotifications.requestPermissions());
    return display === 'granted';
  } catch (err) {
    console.warn('Notifications unavailable:', err);
    return false;
  }
}

/** Whether notifications are allowed, without asking. */
export async function remindersAllowed(): Promise<boolean> {
  if (!isNative) return false;
  return (await LocalNotifications.checkPermissions().catch(() => ({ display: 'denied' }))).display === 'granted';
}

export async function cancelReminders(): Promise<void> {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: IDS.map((id) => ({ id })) }).catch(() => undefined);
}

/** Sets the reminders to exactly these moments. */
export async function setReminders(times: Date[], title: string, body: string): Promise<void> {
  if (!isNative) return;
  await cancelReminders();
  if (!times.length || !(await remindersAllowed())) return;
  try {
    await LocalNotifications.schedule({
      notifications: times.slice(0, IDS.length).map((at, i) => ({ id: IDS[i]!, title, body, channelId: CHANNEL, schedule: { at, allowWhileIdle: true } })),
    });
  } catch (err) {
    console.warn('Setting reading reminders failed:', err);
  }
}
