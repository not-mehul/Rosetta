<script lang="ts">
  import { t } from '../../i18n/index.svelte';
  // A one-line question in a modal: a PDF's password, a collection's name.
  import { ui } from '../../state/ui.svelte';
  import Modal from './Modal.svelte';

  let value = $state('');
  let input = $state<HTMLInputElement>();
  $effect(() => {
    value = ui.promptRequest?.value ?? '';
    queueMicrotask(() => input?.focus());
  });
</script>

{#if ui.promptRequest}
  {@const request = ui.promptRequest}
  <Modal title={request.title} closeLabel={t('action.close')} onclose={() => request.resolve(null)}>
    <form
      onsubmit={(e) => {
        e.preventDefault();
        if (value.trim() || request.secret) request.resolve(value);
      }}
    >
      {#if request.message}<p class="t-body-small">{request.message}</p>{/if}
      <label class="field">
        <span class="t-field-label">{request.label}</span>
        <input
          class="input"
          id="promptInput"
          bind:this={input}
          bind:value
          type={request.secret ? 'password' : 'text'}
          autocomplete={request.secret ? 'current-password' : 'off'}
          enterkeyhint="done"
          inputmode="text"
        />
      </label>
      <div class="btn-row">
        <button type="button" class="btn btn-muted" onclick={() => request.resolve(null)}>{t('action.cancel')}</button>
        <button type="submit" class="btn btn-primary" id="promptAction" disabled={!request.secret && !value.trim()}>{request.action}</button>
      </div>
    </form>
  </Modal>
{/if}
