<script lang="ts">
  import { t } from '../../i18n/index.svelte';
  import { ui } from '../../state/ui.svelte';
  import Modal from './Modal.svelte';
</script>

{#if ui.confirmRequest}
  {@const request = ui.confirmRequest}
  <Modal title={request.title} closeLabel={t('action.close')} onclose={() => request.resolve(false)}>
    <p class="t-body-small">{request.message}</p>
    <div class="btn-row">
      <button type="button" class="btn btn-muted" onclick={() => request.resolve(false)}>{t('action.cancel')}</button>
      <button type="button" class="btn {request.danger ? 'btn-danger' : 'btn-primary'}" id="confirmAction" onclick={() => request.resolve(true)}>{request.action}</button>
    </div>
  </Modal>
{/if}
