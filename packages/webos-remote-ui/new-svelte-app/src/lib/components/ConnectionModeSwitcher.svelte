<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ConnectionMode } from '$utils/network';

  export let mode: ConnectionMode = 'manual';

  const dispatch = createEventDispatcher<{ change: ConnectionMode }>();

  let selected: ConnectionMode = mode;

  $: if (mode !== selected) {
    selected = mode;
  }

  function onChange() {
    if (selected !== mode) {
      dispatch('change', selected);
    }
  }
</script>

<div class="connection-type-selector">
  <label class="radio-button">
    <input type="radio" name="connection-mode" value="manual" bind:group={selected} on:change={onChange} />
    <span>הזנה ידנית</span>
  </label>
  <label class="radio-button">
    <input type="radio" name="connection-mode" value="list" bind:group={selected} on:change={onChange} />
    <span>בחירה מרשימה</span>
  </label>
</div>
