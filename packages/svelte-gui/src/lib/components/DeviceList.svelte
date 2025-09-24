<script lang="ts">
	import { devices } from '$lib/stores/devices';
	import DeviceListItem from './DeviceListItem.svelte';
</script>

<div>
	{#if $devices.length === 0}
		<p>No devices found. Searching...</p>
	{:else}
		<ul class="space-y-4">
			{#each $devices as device (device.UDN)}
				<DeviceListItem {device} />
			{/each}
		</ul>
	{/if}
</div>

<style>
	ul {
		list-style: none;
		padding: 0;
	}
</style>
