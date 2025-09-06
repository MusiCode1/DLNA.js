<script lang="ts">
	import DeviceList from '$lib/components/DeviceList.svelte';

	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<DeviceList />
