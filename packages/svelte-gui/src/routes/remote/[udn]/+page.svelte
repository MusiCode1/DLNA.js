<script lang="ts">
  import RemoteControl from '$lib/components/RemoteControl.svelte';
  import { page } from '$app/stores';

  const udn = $page.params.udn;
</script>

{#if udn}
  <RemoteControl {udn} />
{:else}
  <p class="text-red-400">Error: Device UDN is missing.</p>
{/if}