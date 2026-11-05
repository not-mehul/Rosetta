<script lang="ts">
  import { t } from '../../i18n/index.svelte';
  import { reader } from '../../state/reader.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import ReadingControls from './ReadingControls.svelte';

  let { onclose }: { onclose: () => void } = $props();
</script>

<Sheet title={t('reader.type')} {onclose}>
  <ReadingControls show={reader.content ? (reader.isPdf ? 'pdf' : 'flow') : 'both'} />
</Sheet>
