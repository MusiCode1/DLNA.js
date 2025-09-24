<script lang="ts">
	import FileBrowser from '$lib/components/FileBrowser.svelte';
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const udn = page.params.udn;

	onMount(() => {
		console.log(data);
	});
</script>

{#if udn}
	<FileBrowser {udn} />
{:else}
	<p class="text-red-400">Error: Device UDN is missing.</p>
{/if}
