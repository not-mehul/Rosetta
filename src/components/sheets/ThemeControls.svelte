<script lang="ts">
  // The theme (System, Dusk, Dawn) and true black: in Settings, and in the
  // reader's Light tab, where it matters at night.
  import { Switch } from 'dusk-dawn';
  import { t } from '../../i18n/index.svelte';
  import { settings } from '../../state/settings.svelte';

  const v = $derived(settings.value);
</script>

<div class="field">
  <span class="t-field-label" id="themeLabel">{t('type.theme')}</span>
  <div class="segmented" role="radiogroup" aria-labelledby="themeLabel">
    {#each [['system', t('type.system')], ['dark', t('type.dusk')], ['light', t('type.dawn')]] as const as [id, label] (id)}
      <button type="button" role="radio" aria-checked={v.theme === id} onclick={() => void settings.update({ theme: id })}>{label}</button>
    {/each}
  </div>
</div>
<div class="settings-list">
  <Switch checked={v.oled} label={t('type.oled')} hint={t('type.oledHint')} onchange={(on) => void settings.update({ oled: on })} />
</div>
