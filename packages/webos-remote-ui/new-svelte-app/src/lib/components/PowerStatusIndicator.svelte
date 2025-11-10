<script lang="ts">
  import type { PowerStatus } from '$services/wake-service';

  export let status: PowerStatus = 'unknown';
  export let message = 'מצב המסך לא ידוע';

  const classMap: Record<PowerStatus, string> = {
    unknown: 'power-status power-status--unknown',
    checking: 'power-status power-status--loading',
    waking: 'power-status power-status--loading',
    awake: 'power-status power-status--on',
    offline: 'power-status power-status--off',
    error: 'power-status power-status--error'
  };
</script>

<div id="power-status-indicator" class={classMap[status]}>
  <span class="power-status__dot"></span>
  <span id="power-status-text">{message}</span>
</div>
