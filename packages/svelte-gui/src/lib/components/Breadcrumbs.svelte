<script lang="ts">
  let {
    path,
    onNavigate,
    children
  }: {
    path: { id: string; title: string }[];
    onNavigate: (id: string, title: string) => void;
    children?: import('svelte').Snippet;
  } = $props();
</script>

<nav class="flex items-center gap-2 text-gray-400 pb-4 border-b border-gray-700 mb-4">
  {#each path as segment, i}
    <button
      onclick={() => onNavigate(segment.id, segment.title)}
      disabled={i === path.length - 1}
      class="hover:text-white disabled:text-white disabled:font-bold disabled:cursor-default transition-colors"
    >
      {segment.title}
    </button>
    {#if i < path.length - 1}
      <span>/</span>
    {/if}
  {/each}
  {#if children}
    {@render children()}
  {/if}
</nav>