<script lang="ts">
  import { remoteService, type RemoteAction } from '$services/remote-service';
  import { notificationStore } from '$stores/notifications';

  type Props = {
    isConnected?: boolean;
  };

  let { isConnected = false }: Props = $props();

  let toastVisible = $state(false);
  let toastMessage = $state('');
  let textValue = $state('');

  function requireConnection() {
    if (!isConnected) {
      notificationStore.push('error', 'יש להתחבר למסך לפני ביצוע פעולה.');
      return false;
    }
    return true;
  }

  async function perform(action: RemoteAction) {
    if (!requireConnection()) return;
    try {
      await remoteService.perform(action);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת שלט';
      notificationStore.push('error', `הפעולה נכשלה: ${message}`);
    }
  }

  async function sendText(value: string) {
    if (!requireConnection()) return;
    try {
      await remoteService.sendText(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת הקלדה';
      notificationStore.push('error', `הפעולה נכשלה: ${message}`);
    }
  }

  async function sendEnter() {
    if (!requireConnection()) return;
    try {
      await remoteService.sendEnter();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת שליחה';
      notificationStore.push('error', `הפעולה נכשלה: ${message}`);
    }
  }

  async function sendDelete() {
    if (!requireConnection()) return;
    try {
      await remoteService.sendDelete();
      textValue = textValue.slice(0, -1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת מחיקה';
      notificationStore.push('error', `הפעולה נכשלה: ${message}`);
    }
  }

  async function submitToast() {
    if (!requireConnection()) return;
    if (!toastMessage.trim()) return;
    try {
      await remoteService.createToast(toastMessage.trim());
      toastMessage = '';
      toastVisible = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת Toast';
      notificationStore.push('error', `הפעולה נכשלה: ${message}`);
    }
  }
</script>

<div id="controls" class="card" style="flex: 1;">
  <h2>ניווט ושמע</h2>
  <div class="navigation-controls">
    <div class="d-pad-circular-container">
      <div class="d-pad-circular-bg">
        <button class="d-pad-btn d-pad-up" onclick={() => perform({ type: 'button', payload: 'UP' })} disabled={!isConnected}>▲</button>
        <button class="d-pad-btn d-pad-left" onclick={() => perform({ type: 'button', payload: 'LEFT' })} disabled={!isConnected}>◄</button>
        <button class="d-pad-btn d-pad-center" onclick={() => perform({ type: 'button', payload: 'ENTER' })} disabled={!isConnected}>OK</button>
        <button class="d-pad-btn d-pad-right" onclick={() => perform({ type: 'button', payload: 'RIGHT' })} disabled={!isConnected}>►</button>
        <button class="d-pad-btn d-pad-down" onclick={() => perform({ type: 'button', payload: 'DOWN' })} disabled={!isConnected}>▼</button>
      </div>
    </div>

    <div class="volume-controls">
      <button onclick={() => perform({ type: 'uri', uri: 'ssap://audio/volumeUp' })} disabled={!isConnected}>Volume +</button>
      <button onclick={() => perform({ type: 'uri', uri: 'ssap://audio/volumeDown' })} disabled={!isConnected}>Volume -</button>
    </div>
  </div>

  <h2>פעולות מהירות</h2>
  <div class="quick-actions">
    <button onclick={() => perform({ type: 'button', payload: 'BACK' })} disabled={!isConnected}>חזור</button>
    <button onclick={() => perform({ type: 'button', payload: 'HOME' })} disabled={!isConnected}>בית</button>
    <button onclick={() => perform({ type: 'uri', uri: 'ssap://audio/setMute', payload: { mute: true } })} disabled={!isConnected}>השתק</button>
    <button onclick={() => perform({ type: 'uri', uri: 'ssap://audio/setMute', payload: { mute: false } })} disabled={!isConnected}>בטל השתקה</button>
  </div>

  <h2>מערכת ותצוגה</h2>
  <div class="grid-controls">
    <button id="show-toast-btn" onclick={() => (toastVisible = !toastVisible)} disabled={!isConnected}>
      {toastVisible ? 'הסתר הודעה' : 'הצג הודעה'}
    </button>
    <button class="power-off-btn" onclick={() => perform({ type: 'uri', uri: 'ssap://system/turnOff' })} disabled={!isConnected}>
      כיבוי
    </button>
  </div>

  <h2>הקלדה</h2>
  <div class="input-group">
    <input
      type="text"
      id="text-input"
      placeholder="הקלד כאן..."
      bind:value={textValue}
      oninput={(event) => sendText((event.target as HTMLInputElement).value)}
      disabled={!isConnected}
    />
    <button id="enter-btn" onclick={sendEnter} disabled={!isConnected}>שלח Enter</button>
    <button id="delete-btn" onclick={sendDelete} disabled={!isConnected}>מחק תו</button>
  </div>

  <div id="toast-input" class="input-group" style:display={toastVisible ? 'flex' : 'none'}>
    <input
      type="text"
      id="toast-message"
      placeholder="הודעה להצגה"
      bind:value={toastMessage}
      disabled={!isConnected}
    />
    <button id="send-toast-btn" onclick={submitToast} disabled={!isConnected || !toastMessage.trim()}>שלח</button>
  </div>
</div>
