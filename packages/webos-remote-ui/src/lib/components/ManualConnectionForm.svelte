<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let ipAddress = '';
  export let clientKey = '';
  export let macAddress = '';

  const dispatch = createEventDispatcher<{
    ipInput: string;
    ipBlur: string;
    clientKeyInput: string;
    macInput: string;
    macBlur: string;
  }>();
</script>

<div class="connection-form" id="manual-connection">
  <div class="input-group">
    <input
      type="text"
      id="tv-ip"
      placeholder="הכנס כתובת IP של הטלוויזיה"
      value={ipAddress}
      on:input={(event) => dispatch('ipInput', (event.target as HTMLInputElement).value)}
      on:change={(event) => dispatch('ipBlur', (event.target as HTMLInputElement).value)}
    />
    <input
      type="text"
      id="client-key"
      placeholder="מפתח לקוח (אופציונלי)"
      value={clientKey}
      on:input={(event) => dispatch('clientKeyInput', (event.target as HTMLInputElement).value)}
    />
    <input
      type="text"
      id="tv-mac"
      placeholder="כתובת MAC (ל-WoL)"
      value={macAddress}
      on:input={(event) => dispatch('macInput', (event.target as HTMLInputElement).value)}
      on:change={(event) => dispatch('macBlur', (event.target as HTMLInputElement).value)}
    />
  </div>
</div>
