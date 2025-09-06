<script lang="ts">
  let {
    show,
    onClose,
    children,
    contentClass = ''
  }: {
    show: boolean;
    onClose: () => void;
    children: import('svelte').Snippet;
    contentClass?: string;
  } = $props();

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

{#if show}
  <div
    class="modal-backdrop"
    onclick={onClose}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class={`modal-content ${contentClass}`} onclick={(e) => e.stopPropagation()} onkeydown={handleKeydown} role="button" tabindex="0">
      <button class="close-button" onclick={onClose}>X</button>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .modal-content {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    position: relative;
  }
  .close-button {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
  }
</style>