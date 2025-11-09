import { WebOSRemote } from 'lg-webos-remote';
import { get } from 'svelte/store';
import { connectionStore } from '$stores/connection';
import { powerStateStore } from '$stores/power-state';
import { notificationStore } from '$stores/notifications';
import { resolveProxyPath, resolveWebSocketUrl } from '$utils/env';

export type RemoteAction =
  | { type: 'button'; payload: string }
  | { type: 'uri'; uri: string; payload?: Record<string, unknown> };

class RemoteService {
  private remote: WebOSRemote | null = null;
  private continuousInterval: ReturnType<typeof setInterval> | null = null;

  get isConnected(): boolean {
    return Boolean(this.remote);
  }

  async connect(ipAddress: string, clientKey?: string) {
    if (!ipAddress) {
      throw new Error('אנא הכנס כתובת IP של הטלוויזיה.');
    }

    this.disconnect();
    connectionStore.setStatus('connecting', 'מתחבר...');

    const remote = new WebOSRemote({
      ip: ipAddress,
      clientKey: clientKey || undefined,
      proxyUrl: resolveWebSocketUrl('/ws')
    });

    this.remote = remote;
    this.registerEventHandlers(remote);

    try {
      await remote.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאת התחברות';
      connectionStore.setStatus('disconnected', `שגיאת התחברות: ${message}`);
      this.remote = null;
      throw error;
    }
  }

  disconnect() {
    if (this.remote) {
      this.remote.disconnect();
      this.remote.removeAllListeners();
      this.remote = null;
    }
    this.stopContinuousScreenshots();
    connectionStore.setStatus('disconnected', 'מנותק');
    powerStateStore.reset();
  }

  private registerEventHandlers(remote: WebOSRemote) {
    remote.on('connect', () => {
      connectionStore.setStatus('prompt', 'מחובר לפרוקסי, ממתין לחיבור לטלוויזיה...');
      powerStateStore.setStatus('checking', 'בודק האם המסך פעיל...');
    });

    remote.on('proxyConnected', () => {
      connectionStore.setStatus('connected', 'מחובר!');
      powerStateStore.setStatus('awake', 'המסך כרגע דולק');
    });

    remote.on('disconnect', () => {
      notificationStore.push('info', 'החיבור לטלוויזיה נסגר.');
      connectionStore.setStatus('disconnected', 'מנותק');
      powerStateStore.setStatus('unknown', 'מצב המסך לא ידוע');
      const { ipAddress, macAddress } = get(connectionStore);
      powerStateStore.scheduleCheck(ipAddress, macAddress, 0);
      this.stopContinuousScreenshots();
      this.remote = null;
    });

    remote.on('error', (error) => {
      connectionStore.setStatus('disconnected', `שגיאה: ${error.message}`);
      notificationStore.push('error', `הפעולה נכשלה: ${error.message}`);
      powerStateStore.setStatus('error', error.message);
    });

    remote.on('prompt', () => {
      connectionStore.setStatus('prompt', 'נא לאשר את החיבור בטלוויזיה.');
    });

    remote.on('registered', (key: string) => {
      connectionStore.updateManual({ clientKey: key });
      connectionStore.setStatus('connected', 'נרשם בהצלחה! מפתח הלקוח נשמר.');
      void this.takeScreenshot();
    });
  }

  private stopContinuousScreenshots() {
    if (this.continuousInterval) {
      clearInterval(this.continuousInterval);
      this.continuousInterval = null;
    }
  }

  async perform(action: RemoteAction) {
    if (!this.remote) {
      throw new Error('Not connected to TV');
    }

    if (action.type === 'button') {
      await this.remote.sendButton(action.payload);
      return;
    }

    await this.remote.sendMessage({ type: 'request', uri: action.uri, payload: action.payload });
  }

  async sendEnter() {
    if (!this.remote) throw new Error('Not connected');
    await this.remote.sendEnter();
  }

  async sendDelete() {
    if (!this.remote) throw new Error('Not connected');
    await this.remote.sendDelete();
  }

  async sendText(text: string) {
    if (!this.remote) throw new Error('Not connected');
    await this.remote.sendText(text);
  }

  async createToast(message: string) {
    if (!this.remote) throw new Error('Not connected');
    await this.remote.createToast(message);
  }

  async takeScreenshot(): Promise<string | null> {
    if (!this.remote) return null;
    const originalUrl = await this.remote.takeScreenshot();
    return `${resolveProxyPath('/proxy')}?url=${encodeURIComponent(originalUrl)}&t=${Date.now()}`;
  }

  toggleContinuousScreenshots(enabled: boolean, onTick: (url: string | null) => void) {
    this.stopContinuousScreenshots();
    if (!enabled) return;
    void this.takeScreenshot()
      .then((url) => onTick(url))
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'שגיאה בצילום המסך';
        notificationStore.push('error', message);
      });

    this.continuousInterval = setInterval(async () => {
      try {
        const url = await this.takeScreenshot();
        onTick(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'שגיאה בצילום המסך';
        notificationStore.push('error', message);
        this.stopContinuousScreenshots();
      }
    }, 1000);
  }
}

export const remoteService = new RemoteService();
