<script lang="ts">
  import type { ConnectionStatus } from '$stores/connection';

  export let status: ConnectionStatus = 'disconnected';
  export let message = '';

  const classMap: Record<ConnectionStatus, string> = {
    disconnected: 'status disconnected',
    connected: 'status connected',
    connecting: 'status prompt',
    prompt: 'status prompt'
  };
</script>

<div id="status" class={classMap[status]}>{message}</div>
