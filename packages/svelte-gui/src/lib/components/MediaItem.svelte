<script lang="ts">
  import type { MediaItem } from '$lib/api';

  let {
    item,
    onNavigate,
    onPlayTo,
    onFolderSelect
  }: {
    item: MediaItem;
    onNavigate: (id: string, title: string) => void;
    onPlayTo?: (item: MediaItem) => void | Promise<void>;
    onFolderSelect?: (id: string, title: string) => void;
  } = $props();


  const isContainer = item.class.startsWith('object.container');
  const isVideo = item.class.startsWith('object.item.videoItem');

  function getResourceUrl() {
    if (item.res && typeof item.res === 'string') {
      return item.res;
    }
    if (item.res && typeof item.res === 'object' && '_' in item.res) {
      return item.res._;
    }
    if (Array.isArray(item.resources) && item.resources.length > 0 && '_' in item.resources[0]) {
      return item.resources[0]._;
    }
    return null;
  }

  const resourceUrl = getResourceUrl();
</script>

<li class="flex items-center gap-4 p-2 hover:bg-gray-700 rounded-md">
  <span class="text-2xl">
    {#if isContainer}
      📁
    {:else if item.class.startsWith('object.item.imageItem')}
      🖼️
    {:else if item.class.startsWith('object.item.audioItem')}
      🎵
    {:else if isVideo}
      🎬
    {:else}
      📄
    {/if}
  </span>

  <span class="flex-grow">
    {#if isContainer}
      <button onclick={() => onNavigate(item.id, item.title)} class="text-left text-blue-400 hover:underline">
        {item.title || 'Untitled'}
      </button>
    {:else}
      {item.title || 'Untitled'}
    {/if}
  </span>

  <div class="flex items-center gap-2">
    {#if !isContainer && resourceUrl}
      <a href={resourceUrl} target="_blank" rel="noopener noreferrer" class="bg-gray-600 hover:bg-gray-500 text-white text-xs font-bold py-1 px-2 rounded-md transition-colors">Play</a>
    {/if}
    {#if isVideo && onPlayTo}
      <button onclick={() => onPlayTo(item)} class="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-1 px-2 rounded-md transition-colors">Play To...</button>
    {/if}
    {#if isContainer && onFolderSelect}
        <button onclick={() => onFolderSelect(item.id, item.title)} class="bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1 px-2 rounded-md transition-colors">Select</button>
    {/if}
  </div>
</li>