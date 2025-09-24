<script lang="ts">
	import type { ApiDevice } from '$lib/api';

	// Using Svelte 5 runes to define props
	let { device }: { device: ApiDevice } = $props();

	const BASE_API_URL = import.meta.env.VITE_BASE_API_URL;

	// Helper to get a proxied icon URL
	function getIconUrl(iconUrl: string, baseURL: string | undefined = '', udn: string) {
		const fullIconUrl = typeof baseURL == 'string' ? new URL(iconUrl, baseURL) : new URL(iconUrl);
		const iconUrlPath = fullIconUrl.pathname + (fullIconUrl.search ? fullIconUrl.search : '');
		return BASE_API_URL + `/proxy/${udn}${iconUrlPath}`;
	}
</script>

<li
	class="flex flex-col items-start justify-between gap-4 rounded-lg bg-gray-800 p-4 shadow-md sm:flex-row sm:items-center"
>
	<div class="flex items-center gap-4">
		{#if device.iconList && device.iconList.length > 0 && device.iconList[0].url}
			<img
				class="h-12 w-12 rounded-md"
				src={getIconUrl(device.iconList[0].url, device.presentationURL, device.UDN)}
				alt="{device.friendlyName} logo"
			/>
		{/if}
		<div>
			<h3 class="text-lg font-bold text-gray-100">{device.friendlyName}</h3>
			<p class="text-sm text-gray-400">{device.modelName || 'N/A'}</p>
		</div>
	</div>
	<div class="flex flex-wrap items-center gap-2">
		{#if device.location}
			<a
				href={device.location}
				target="_blank"
				rel="noopener noreferrer"
				class="rounded-md bg-gray-700 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-gray-600"
			>
				Open Page
			</a>
		{/if}
		{#if (device.serviceList as any).ContentDirectory}
			<a
				href={`/browse/${device.UDN}`}
				class="rounded-md bg-blue-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500"
				>Browse</a
			>
		{/if}
		{#if (device.serviceList as any).AVTransport}
			<a
				href={`/remote/${device.UDN}`}
				class="rounded-md bg-green-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-green-500"
				>Remote</a
			>
		{/if}
	</div>
</li>
