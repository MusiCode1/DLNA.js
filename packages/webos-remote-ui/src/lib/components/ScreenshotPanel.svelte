<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let screenshotUrl: string | null = null;
  export let isContinuous = false;
  export let isConnected = false;
  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    capture: void;
    toggle: boolean;
  }>();
</script>

<div id="screenshot-container" class="card" style="flex: 1; display: flex; flex-direction: column;">
  <h2>צילום מסך</h2>
  <div style="position: relative; flex-grow: 1; min-height: 200px; display: flex; align-items: center; justify-content: center; background-color: #f0f2f5; border-radius: 6px;">
    {#if screenshotUrl}
      <img
        id="screenshot-img"
        alt="צילום מסך"
        src={screenshotUrl}
        style="width: 100%; height: 100%; border-radius: 6px; object-fit: contain; position: absolute; top: 0; left: 0;"
      />
    {:else}
      <div id="screenshot-placeholder" style="text-align: center; color: #65676b;">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <circle cx="8.5" cy="8.5" r="1.5"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <p style="margin-top: 10px;">צילום מסך יוצג כאן</p>
      </div>
    {/if}
  </div>

  <div class="screenshot-controls" style="margin-top: 16px;">
    <button id="screenshot-btn" on:click={() => dispatch('capture')} disabled={!isConnected || isLoading}>
      {isLoading ? 'מצלם...' : 'צלם מסך'}
    </button>
    <label for="continuous-screenshot-cb">
      <input
        type="checkbox"
        id="continuous-screenshot-cb"
        bind:checked={isContinuous}
        disabled={!isConnected}
        on:change={(event) => dispatch('toggle', (event.target as HTMLInputElement).checked)}
      />
      <span>רצף</span>
    </label>
  </div>
</div>
