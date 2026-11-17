<script lang="ts">
  // True black for OLED screens, and night light: the page dimmed and warmed
  // together, in five steps from off to night. For every book, in a book
  // under Aa → Light and in Settings.
  import { Switch } from 'dusk-dawn';
  import { t, type MessageKey } from '../../i18n/index.svelte';
  import { NIGHT_LIGHT, type NightLight, type Settings } from '../../state/settings';

  interface Props {
    v: Settings;
    set: (patch: Partial<Settings>) => void;
  }
  let { v, set }: Props = $props();
  const STEPS: { id: NightLight; label: MessageKey }[] = [
    { id: 'off', label: 'light.off' },
    { id: 'soft', label: 'light.soft' },
    { id: 'warm', label: 'light.warm' },
    { id: 'evening', label: 'light.evening' },
    { id: 'night', label: 'light.night' },
  ];
</script>

<div class="settings-list">
  <Switch checked={v.oled} label={t('type.oled')} hint={t('type.oledHint')} onchange={(on) => set({ oled: on })} />
</div>

<div class="field">
  <span class="t-field-label" id="nightLightLabel">{t('light.label')}</span>
  <div class="light-steps" role="radiogroup" aria-labelledby="nightLightLabel">
    {#each STEPS as step (step.id)}
      <button type="button" role="radio" class="light-step" data-light={step.id} aria-checked={v.nightLight === step.id} onclick={() => set({ nightLight: step.id })}>
        <!-- A scrap of page under the step's veil, so each one shows what it does. -->
        <span class="light-swatch" aria-hidden="true" style:--dim={NIGHT_LIGHT[step.id].dim} style:--warmth={NIGHT_LIGHT[step.id].warmth}><span>Aa</span></span>
        <span class="light-name">{t(step.label)}</span>
      </button>
    {/each}
  </div>
  <span class="field-hint">{t('light.hint')}</span>
</div>

<style>
  .light-steps {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .light-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    min-height: 44px;
    padding: var(--space-1) 0;
    border-radius: var(--corner-sm);
    color: var(--text-dim);
    transition: color var(--dur-hover);
  }
  .light-step[aria-checked='true'] {
    color: var(--text-heading);
  }
  .light-swatch {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1.15;
    border: 1px solid var(--border);
    border-radius: var(--corner-sm);
    background: var(--input-bg);
    overflow: hidden;
    font-family: var(--font-serif);
    font-size: 1.125rem;
    color: var(--text-heading);
    transition:
      border-color var(--dur-hover),
      border-radius var(--spring-spatial-fast-dur) var(--spring-spatial-fast);
  }
  /* The same veil the reader lays over the page (ReaderView's .night-veil). */
  .light-swatch::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(rgba(var(--accent-amber-rgb), calc(var(--warmth) * 0.22)), rgba(var(--accent-amber-rgb), calc(var(--warmth) * 0.22))), rgba(var(--shadow-rgb), var(--dim));
    mix-blend-mode: multiply;
  }
  .light-step[aria-checked='true'] .light-swatch {
    border: 2px solid var(--accent-amber);
    border-radius: var(--corner-md);
  }
  .light-name {
    font-size: 0.75rem;
    line-height: 1.2;
    text-align: center;
  }
</style>
