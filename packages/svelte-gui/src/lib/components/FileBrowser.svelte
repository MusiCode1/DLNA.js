<script lang="ts">
  import { browseContent, getDevices, playItem, type ApiDevice, type MediaItem } from '$lib/api';
  import MediaItemComponent from './MediaItem.svelte';
  import Breadcrumbs from './Breadcrumbs.svelte';
  import Modal from './Modal.svelte';
  import { goto } from '$app/navigation';

  let {
    udn,
    onFolderSelect
  }: {
    udn: string;
    onFolderSelect?: (id: string, title: string) => void;
  } = $props();

  // --- Component State ---
  let items = $state<MediaItem[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let path = $state<{ id: string; title: string }[]>([{ id: '0', title: 'Root' }]);
  
  let showPlayToModal = $state(false);
  let selectedItemForPlayTo = $state<MediaItem | null>(null);
  let availableRenderers = $state<ApiDevice[]>([]);
  let selectedRendererUdn = $state('');

  // --- Derived State ---
  let currentObjectId = $derived(path[path.length - 1].id);

  // --- Effects ---
  $effect(() => {
    async function loadContent() {
      isLoading = true;
      error = null;
      try {
        const result = await browseContent(udn, currentObjectId);
        items = result.items;
      } catch (e: any) {
        error = e.message || 'Failed to load content.';
      } finally {
        isLoading = false;
      }
    }
    loadContent();
  });

  // --- Event Handlers ---
  function handleNavigate(id: string, title: string) {
    const existingIndex = path.findIndex(p => p.id === id);
    if (existingIndex !== -1) {
      path = path.slice(0, existingIndex + 1);
    } else {
      path = [...path, { id, title }];
    }
  }

  async function handlePlayTo(item: MediaItem) {
    selectedItemForPlayTo = item;
    showPlayToModal = true;
    
    // Fetch renderers when the modal is opened
    try {
        const allDevices = await getDevices();
        availableRenderers = allDevices.filter(d => d.serviceList?.['AVTransport']);
        if (availableRenderers.length > 0) {
            selectedRendererUdn = availableRenderers[0].UDN;
        }
    } catch (err) {
        console.error("Failed to fetch renderers", err);
        // Handle error display in modal if necessary
    }
  }

  async function confirmPlayTo() {
    if (!selectedItemForPlayTo || !selectedRendererUdn) return;

    try {
      await playItem(selectedRendererUdn, udn, selectedItemForPlayTo.id);
      showPlayToModal = false;
      // Navigate to the remote control page for the selected renderer
      goto(`/remote/${selectedRendererUdn}`);
    } catch (err) {
      console.error("Failed to play item", err);
      // Handle error display
    }
  }
</script>

<div class="bg-gray-800 rounded-lg shadow-md p-4 h-full flex flex-col">
	<Breadcrumbs {path} onNavigate={handleNavigate}>
		{#if onFolderSelect}
			<button
				onclick={() => onFolderSelect(currentObjectId, path[path.length - 1].title)}
				class="ml-4 bg-green-600 hover:bg-green-500 text-white font-bold py-1 px-3 rounded-md text-sm transition-colors"
			>
				Select Current Folder
			</button>
		{/if}
	</Breadcrumbs>

	<div class="flex-grow overflow-y-auto mt-4">
		{#if isLoading}
			<p class="text-gray-400">Loading...</p>
		{:else if error}
			<p class="text-red-400 bg-red-900/50 p-3 rounded-md">{error}</p>
		{:else if items.length === 0}
			<p class="text-gray-400">This folder is empty.</p>
		{:else}
			<ul class="divide-y divide-gray-700">
				{#each items as item (item.id)}
					<MediaItemComponent
						item={item}
						onNavigate={handleNavigate}
						onPlayTo={onFolderSelect ? undefined : handlePlayTo}
						onFolderSelect={onFolderSelect}
					/>
				{/each}
			</ul>
		{/if}
	</div>

	<Modal show={showPlayToModal} onClose={() => (showPlayToModal = false)}>
		{#if selectedItemForPlayTo}
			<div class="p-4 text-white">
				<h2 class="text-xl font-bold mb-4">Play "{selectedItemForPlayTo.title}" on:</h2>
				{#if availableRenderers.length > 0}
					<div class="flex flex-col gap-4">
						<select
							bind:value={selectedRendererUdn}
							class="bg-gray-700 border border-gray-600 rounded-md p-2"
						>
							{#each availableRenderers as renderer (renderer.UDN)}
								<option value={renderer.UDN}>{renderer.friendlyName}</option>
							{/each}
						</select>
						<button
							onclick={confirmPlayTo}
							disabled={!selectedRendererUdn}
							class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-md transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
						>
							Confirm
						</button>
					</div>
				{:else}
					<p>No available renderers found.</p>
				{/if}
			</div>
		{/if}
	</Modal>
</div>

<style>
  ul {
    list-style: none;
    padding: 0;
  }
</style>