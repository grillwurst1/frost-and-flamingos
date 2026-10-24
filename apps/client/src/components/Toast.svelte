<script lang="ts">
  import { toast } from '../state/game';
  import { t } from '../state/locale';
</script>

{#if $toast}
  <div class="toast-stack" role="status">
    <div class="toast">{$t($toast.key, $toast.params)}</div>
  </div>
{/if}
