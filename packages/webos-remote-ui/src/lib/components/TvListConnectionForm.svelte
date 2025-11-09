<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { TvInfo } from '$stores/tv-list';

  export let options: TvInfo[] = [];
  export let selectedName: string | null = null;
  export let isLoading = false;
  export let error: string | undefined;

  const dispatch = createEventDispatcher<{ select: string }>();

  $: selectedTv = options.find((item) => item.name === selectedName);
</script>

<div class="connection-form" id="list-connection">
  <div class="input-group">
    <select
      id="tv-select"
      class="tv-select"
      bind:value={selectedName}
      on:change={(event) => dispatch('select', (event.target as HTMLSelectElement).value)}
      disabled={isLoading || options.length === 0}
    >
      <option value="">{isLoading ? 'טוען טלוויזיות...' : 'בחר טלוויזיה...'}</option>
      {#each options as option}
        <option value={option.name}>{option.name}</option>
      {/each}
    </select>
  </div>

  {#if error}
    <div class="status prompt" style="margin-top: 10px;">{error}</div>
  {/if}

  {#if selectedTv}
    <div id="selected-tv-details" class="tv-details">
      <div class="detail-row">
        <span class="detail-label">שם:</span>
        <span class="detail-value" id="selected-tv-name">{selectedTv.name}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">IP:</span>
        <span class="detail-value" id="selected-tv-ip">{selectedTv.ip}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">MAC:</span>
        <span class="detail-value" id="selected-tv-mac">{selectedTv.macAddress ?? 'לא ידוע'}</span>
      </div>
    </div>
  {/if}
</div>
