<script lang="ts">
  import { notificationStore } from '$stores/notifications';
</script>

{#if $notificationStore.length}
  <div class="notification-host">
    {#each $notificationStore as notification}
      <div class={`notification notification--${notification.type}`}>
        <span>{notification.message}</span>
        <button type="button" on:click={() => notificationStore.dismiss(notification.id)}>×</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .notification-host {
    position: fixed;
    top: 20px;
    left: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 9999;
  }

  .notification {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    direction: rtl;
  }

  .notification button {
    background: none;
    border: none;
    color: inherit;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
  }

  .notification--info {
    border-right: 4px solid #1877f2;
  }

  .notification--success {
    border-right: 4px solid #2e7d32;
  }

  .notification--error {
    border-right: 4px solid #c62828;
  }
</style>
