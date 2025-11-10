<script lang="ts">
  import type { TvInfo } from '$stores/tv-list';

  type Props = {
    options?: TvInfo[];
    selectedName?: string | null;
    isLoading?: boolean;
    error?: string;
    onselect?: (name: string) => void;
  };

  let { options = [], selectedName = null, isLoading = false, error, onselect }: Props = $props();

  const selectedTv = $derived(options.find((item) => item.name === (selectedName ?? '')));
</script>

<div class="connection-form" id="list-connection">
  <div class="input-group">
    <select
      id="tv-select"
      class="tv-select"
      value={selectedName ?? ''}
      onchange={(event) => onselect?.((event.target as HTMLSelectElement).value)}
      disabled={isLoading || options.length === 0}
    >
      <option value="">{isLoading ? 'טוען טלוויזיות...' : 'בחר טלוויזיה...'}</option>
      {#each options as option (option.name)}
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
