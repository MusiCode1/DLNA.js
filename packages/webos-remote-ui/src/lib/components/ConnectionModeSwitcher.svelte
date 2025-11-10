<script lang="ts">
  import type { ConnectionMode } from '$utils/network';

  type Props = {
    mode?: ConnectionMode;
    onchange?: (mode: ConnectionMode) => void;
  };

  let { mode = 'manual', onchange }: Props = $props();
</script>

<div class="connection-type-selector">
  <label class="radio-button">
    <input type="radio" name="connection-mode" value="manual" checked={mode === 'manual'} onchange={() => onchange?.('manual')} />
    <span>הזנה ידנית</span>
  </label>
  <label class="radio-button">
    <input type="radio" name="connection-mode" value="list" checked={mode === 'list'} onchange={() => onchange?.('list')} />
    <span>בחירה מרשימה</span>
  </label>
</div>
