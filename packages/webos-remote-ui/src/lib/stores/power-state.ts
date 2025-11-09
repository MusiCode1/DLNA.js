import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { isValidIp, isValidMac } from '$utils/network';
import { wakeService, type PowerStatus } from '$services/wake-service';

export interface PowerState {
  status: PowerStatus;
  message: string;
  isWakeInProgress: boolean;
  isCheckInProgress: boolean;
}

const defaultState: PowerState = {
  status: 'unknown',
  message: 'מצב המסך לא ידוע',
  isWakeInProgress: false,
  isCheckInProgress: false
};

let refreshHandle: ReturnType<typeof setTimeout> | null = null;

function schedule(fn: () => void, delay = 0) {
  if (!browser) return;
  if (refreshHandle) {
    clearTimeout(refreshHandle);
  }
  refreshHandle = setTimeout(fn, delay);
}

function createPowerStateStore() {
  const { subscribe, update, set } = writable<PowerState>(defaultState);

  const api = {
    subscribe,
    reset() {
      if (refreshHandle) {
        clearTimeout(refreshHandle);
        refreshHandle = null;
      }
      set(defaultState);
    },
    setStatus(status: PowerStatus, message?: string) {
      update((state) => ({ ...state, status, message: message ?? state.message }));
    },
    async check(ipAddress: string | null | undefined, macAddress: string | null | undefined) {
      if (!isValidIp(ipAddress) || !isValidMac(macAddress)) {
        update((state) => ({ ...state, status: 'unknown', message: 'מצב המסך לא ידוע', isCheckInProgress: false }));
        return;
      }

      update((state) => ({ ...state, status: 'checking', message: 'בודק האם המסך פעיל...', isCheckInProgress: true }));

      const result = await wakeService.checkPower(ipAddress, macAddress);
      update((state) => ({ ...state, ...result, isCheckInProgress: false }));
    },
    async wake(ipAddress: string | null | undefined, macAddress: string | null | undefined) {
      if (!isValidIp(ipAddress)) {
        throw new Error('אנא הזן כתובת IP תקינה לפני הפעלת המסך.');
      }
      if (!isValidMac(macAddress)) {
        throw new Error('אנא הזן כתובת MAC תקינה (לדוגמה AA:BB:CC:DD:EE:FF).');
      }

      update((state) => ({ ...state, status: 'waking', message: 'מפעיל את המסך...', isWakeInProgress: true }));
      const result = await wakeService.wake(ipAddress, macAddress);
      update((state) => ({ ...state, ...result, isWakeInProgress: false }));

      if (result.status !== 'awake') {
        schedule(() => {
          api.check(ipAddress, macAddress);
        }, 5000);
      }
    },
    scheduleCheck(ipAddress: string | null | undefined, macAddress: string | null | undefined, delay = 0) {
      if (!browser) return;
      if (!isValidIp(ipAddress) || !isValidMac(macAddress)) {
        return;
      }
      schedule(() => {
        api.check(ipAddress, macAddress);
      }, delay);
    }
  };

  return api;
}

export const powerStateStore = createPowerStateStore();
