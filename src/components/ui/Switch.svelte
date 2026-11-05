<script lang="ts">
  // A settings switch: the whole row is the target (style.md §8.17, §14).
  interface Props {
    checked: boolean;
    label: string;
    hint?: string;
    id?: string;
    onchange: (checked: boolean) => void;
  }

  let { checked, label, hint, id, onchange }: Props = $props();
</script>

<button type="button" class="switch-row" role="switch" aria-checked={checked} {id} onclick={() => onchange(!checked)}>
  <span class="switch-text">
    <span class="switch-label">{label}</span>
    {#if hint}<span class="field-hint">{hint}</span>{/if}
  </span>
  <span class="switch-track" aria-hidden="true"><span class="switch-knob"></span></span>
</button>
