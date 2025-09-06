<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	let { data, children }: LayoutProps = $props();

	/* 	let { children, data }: { children: any; data: { pathname: string; title?: string } } = $props(); */
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>{data.title || 'DLNA Web UI'}</title>
</svelte:head>

<div class="min-h-screen bg-gray-900 font-sans text-white">
	<header class="bg-gray-800 p-4 shadow-md">
		<div class="container mx-auto flex items-center justify-between">
			<a href="/" class="text-xl font-bold transition-colors hover:text-blue-400">DLNA Web UI</a>

			<div class="flex items-center gap-4">
				<a href="/settings" class="text-gray-300 transition-colors hover:text-white">Settings</a>
				
				{#if data.pathname !== '/'}
					<button
						onclick={() => history.back()}
						class="rounded-md bg-gray-700 px-4 py-2 font-bold text-white transition-colors hover:bg-gray-600"
					>
						&larr; Back
					</button>
				{/if}
				
			</div>
		</div>
	</header>
	<main class="container mx-auto p-4 md:p-8">
		<h1 class="mb-4 text-2xl font-bold text-gray-300">{data.title || ''}</h1>
		{@render children?.()}
	</main>
</div>
