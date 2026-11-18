// The parts of the app kept out of the first download, each loaded the first
// time it's needed and, once the library is on screen and the phone is idle,
// fetched ahead so it opens at once.
import { part } from './Lazy.svelte';

export const ReaderView = part(() => import('./reader/ReaderView.svelte'));
export const NotesView = part(() => import('./sections/NotesView.svelte'));
export const StatsView = part(() => import('./sections/StatsView.svelte'));
export const ArrangeSheet = part(() => import('./sheets/ArrangeSheet.svelte'));
export const ContentsSheet = part(() => import('./sheets/ContentsSheet.svelte'));
export const DetailsSheet = part(() => import('./sheets/DetailsSheet.svelte'));
export const EditSheet = part(() => import('./sheets/EditSheet.svelte'));
export const ReadingPanel = part(() => import('./sheets/ReadingPanel.svelte'));
export const SearchSheet = part(() => import('./sheets/SearchSheet.svelte'));
export const SettingsSheet = part(() => import('./sheets/SettingsSheet.svelte'));
export const StorageSheet = part(() => import('./sheets/StorageSheet.svelte'));

/** Fetches every part when the main thread is free, the reader first. */
export function prefetchParts(): void {
  const all = [ReaderView, DetailsSheet, SettingsSheet, ArrangeSheet, NotesView, StatsView, ReadingPanel, ContentsSheet, SearchSheet, EditSheet, StorageSheet];
  const idle = (fn: () => void) => ('requestIdleCallback' in globalThis ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200));
  const next = () => {
    const load = all.shift();
    if (load) void load().finally(() => idle(next));
  };
  idle(next);
}
