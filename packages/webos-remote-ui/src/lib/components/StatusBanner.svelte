<script lang="ts">
  import type { ConnectionStatus } from '$stores/connection';

  type Props = {
    status?: ConnectionStatus;
    message?: string;
  };

  let { status = 'disconnected', message = '' }: Props = $props();

  const classMap: Record<ConnectionStatus, string> = {
    disconnected: 'status disconnected',
    connected: 'status connected',
    connecting: 'status prompt',
    prompt: 'status prompt'
  };
</script>

<div id="status" class={classMap[status]}>{message}</div>
