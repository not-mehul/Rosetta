<script lang="ts">
  // A picture full screen: pinch or double-tap to zoom, drag to look around.
  import { t } from '../../i18n/index.svelte';
  import { ui } from '../../state/ui.svelte';
  import Icon from '../ui/Icon.svelte';

  let { src, alt, onclose }: { src: string; alt: string; onclose: () => void } = $props();
  let dialog: HTMLDialogElement;
  let zoom = $state(1);
  let pan = $state({ x: 0, y: 0 });
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; zoom: number } | null = null;
  let drag: { x: number; y: number; pan: { x: number; y: number } } | null = null;
  let lastTap = 0;

  $effect(() => {
    dialog.showModal();
    const release = ui.pushOverlay(onclose);
    return () => {
      release();
      if (dialog.open) dialog.close();
    };
  });

  const clampZoom = (z: number) => Math.max(1, Math.min(6, z));
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  function down(e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) pinch = { d: distance(), zoom };
    else if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, pan: { ...pan } };
      const now = performance.now();
      if (now - lastTap < 300) {
        zoom = zoom > 1 ? 1 : 2.5;
        if (zoom === 1) pan = { x: 0, y: 0 };
        drag = null;
      }
      lastTap = now;
    }
  }
  function move(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) zoom = clampZoom((pinch.zoom * distance()) / Math.max(1, pinch.d));
    else if (drag && zoom > 1) pan = { x: drag.pan.x + e.clientX - drag.x, y: drag.pan.y + e.clientY - drag.y };
  }
  function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) {
      drag = null;
      if (zoom <= 1.02) {
        zoom = 1;
        pan = { x: 0, y: 0 };
      }
    }
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    zoom = clampZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    if (zoom === 1) pan = { x: 0, y: 0 };
  }
</script>

<dialog
  bind:this={dialog}
  class="image-viewer"
  aria-label={alt || t('image.title')}
  oncancel={(e) => {
    e.preventDefault();
    onclose();
  }}
>
  <button type="button" class="btn-icon image-close" id="closeImage" aria-label={t('action.close')} onclick={onclose}><Icon name="x" /></button>
  <div class="image-stage" role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel}>
    <img {src} {alt} draggable="false" style:transform="translate({pan.x}px, {pan.y}px) scale({zoom})" />
  </div>
  {#if alt}<p class="t-hint image-caption">{alt}</p>{/if}
</dialog>
