// The device features the reader uses: keeping the screen on, a light haptic
// tick, and (Android) the volume keys as page turns. Each falls back quietly
// where the platform can't do it.

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { isNative, platform } from './native';

// ─── Keep awake ──────────────────────────────────────────────

let wakeLock: { release: () => Promise<void> } | null = null;
let wantAwake = false;

async function requestWebLock(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
  if (!nav.wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await nav.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}

if (typeof document !== 'undefined') {
  // The browser lets a wake lock go when the page is hidden; take it again on return.
  document.addEventListener('visibilitychange', () => {
    if (wantAwake && !isNative && document.visibilityState === 'visible') void requestWebLock();
  });
}

export async function keepAwake(on: boolean): Promise<void> {
  if (on === wantAwake) return;
  wantAwake = on;
  try {
    if (isNative) {
      await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
    } else if (on) {
      await requestWebLock();
    } else {
      await wakeLock?.release();
      wakeLock = null;
    }
  } catch (err) {
    console.warn('Keep awake failed:', err);
  }
}

// ─── Haptics ─────────────────────────────────────────────────

export function tick(): void {
  if (isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  else (navigator as Navigator & { vibrate?: (ms: number) => boolean }).vibrate?.(8);
}

// ─── Volume keys (Android) ───────────────────────────────────

interface VolumeKeysPlugin {
  enable(): Promise<void>;
  disable(): Promise<void>;
  addListener(event: 'press', fn: (e: { direction: 'up' | 'down' }) => void): Promise<PluginListenerHandle>;
}

const VolumeKeys = registerPlugin<VolumeKeysPlugin>('VolumeKeys');

export const volumeKeysAvailable = platform === 'android' && Capacitor.isPluginAvailable('VolumeKeys');

/** Turns the volume keys into page turns until the returned function is called. Down is forward. */
export function captureVolumeKeys(onPress: (direction: 1 | -1) => void): () => void {
  if (!volumeKeysAvailable) return () => undefined;
  let handle: PluginListenerHandle | null = null;
  let stopped = false;
  void VolumeKeys.enable().catch(() => undefined);
  void VolumeKeys.addListener('press', (e) => onPress(e.direction === 'down' ? 1 : -1)).then((h) => {
    if (stopped) void h.remove();
    else handle = h;
  });
  return () => {
    stopped = true;
    void handle?.remove();
    void VolumeKeys.disable().catch(() => undefined);
  };
}
