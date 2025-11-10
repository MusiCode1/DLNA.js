import { writable } from 'svelte/store';
import { remoteService } from './remote-service';
import { notificationStore } from '$stores/notifications';

export interface ScreenshotState {
  url: string | null;
  isContinuous: boolean;
  isLoading: boolean;
}

const defaultState: ScreenshotState = {
  url: null,
  isContinuous: false,
  isLoading: false
};

class ScreenshotService {
  private store = writable<ScreenshotState>(defaultState);

  subscribe = this.store.subscribe;

  async captureOnce() {
    this.store.update((state) => ({ ...state, isLoading: true }));
    try {
      const url = await remoteService.takeScreenshot();
      this.store.set({ url, isContinuous: false, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'שגיאה בצילום המסך';
      notificationStore.push('error', message);
      this.store.update((state) => ({ ...state, isLoading: false }));
      remoteService.toggleContinuousScreenshots(false, () => undefined);
    }
  }

  setContinuous(enabled: boolean) {
    this.store.update((state) => ({ ...state, isContinuous: enabled }));
    if (!enabled) {
      remoteService.toggleContinuousScreenshots(false, () => undefined);
      return;
    }
    remoteService.toggleContinuousScreenshots(true, (url) => {
      this.store.update((state) => ({ ...state, url, isLoading: false }));
    });
  }

  reset() {
    this.store.set(defaultState);
    remoteService.toggleContinuousScreenshots(false, () => undefined);
  }
}

export const screenshotService = new ScreenshotService();
