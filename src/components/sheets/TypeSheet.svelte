<script lang="ts">
  import { reader } from '../../state/reader.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import ReadingControls from './ReadingControls.svelte';

  let { onclose }: { onclose: () => void } = $props();
</script>

<Sheet title="Type and theme" {onclose}>
  <ReadingControls show={reader.content ? (reader.isPdf ? 'pdf' : 'flow') : 'both'} />
</Sheet>
