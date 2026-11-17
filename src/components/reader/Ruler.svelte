<script lang="ts">
  // The reading ruler: a band over the line being read, the page above and
  // below veiled in its own colour, for keeping the eye on one line. Drag the
  // grip at its edge, or use the arrow keys on it, to move it. Auto-scroll
  // carries the words up through it.
  import { t } from '../../i18n/index.svelte';

  let { lineHeight }: { lineHeight: number } = $props();

  /** The band's top, as a share of the screen's height, so it holds its place when the screen turns. */
  let at = $state(0.38);
  const band = $derived(Math.round(lineHeight * 1.35));
  let dragging: { id: number; dy: number } | null = null;

  const toShare = (y: number) => Math.max(0.08, Math.min(0.88, y / innerHeight));

  function down(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = { id: e.pointerId, dy: e.clientY - at * innerHeight };
  }
  function move(e: PointerEvent) {
    if (dragging?.id === e.pointerId) at = toShare(e.clientY - dragging.dy);
  }
  function up(e: PointerEvent) {
    if (dragging?.id === e.pointerId) dragging = null;
  }
  function key(e: KeyboardEvent) {
    const by = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!by) return;
    e.preventDefault();
    at = toShare(at * innerHeight + by * lineHeight);
  }
</script>

<div class="ruler" style:--ruler-top="{at * 100}dvh" style:--ruler-band="{band}px">
  <div class="ruler-veil ruler-above"></div>
  <div class="ruler-band"></div>
  <div class="ruler-veil ruler-below"></div>
  <div
    class="ruler-grip"
    id="rulerGrip"
    role="slider"
    tabindex="0"
    aria-label={t('ruler.move')}
    aria-orientation="vertical"
    aria-valuemin={8}
    aria-valuemax={88}
    aria-valuenow={Math.round(at * 100)}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
  ></div>
</div>

<style>
  .ruler {
    position: fixed;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }
  .ruler-veil {
    position: absolute;
    left: 0;
    right: 0;
    background: color-mix(in srgb, var(--sheet-bg) 72%, transparent);
  }
  .ruler-above {
    top: 0;
    height: var(--ruler-top);
  }
  .ruler-below {
    top: calc(var(--ruler-top) + var(--ruler-band));
    bottom: 0;
  }
  .ruler-band {
    position: absolute;
    left: 0;
    right: 0;
    top: var(--ruler-top);
    height: var(--ruler-band);
    border-top: 1px solid rgba(var(--accent-amber-rgb), 0.35);
    border-bottom: 1px solid rgba(var(--accent-amber-rgb), 0.35);
  }
  /* The grip: a small tab on the band's right edge, the one part that takes a touch. */
  .ruler-grip {
    position: absolute;
    right: 0;
    top: var(--ruler-top);
    width: 28px;
    height: max(44px, var(--ruler-band));
    pointer-events: auto;
    touch-action: none;
    cursor: ns-resize;
    border-radius: var(--corner-sm) 0 0 var(--corner-sm);
    background: rgba(var(--accent-amber-rgb), 0.28);
  }
  .ruler-grip:focus-visible {
    outline: 2px solid var(--accent-amber);
    outline-offset: -2px;
  }
</style>
