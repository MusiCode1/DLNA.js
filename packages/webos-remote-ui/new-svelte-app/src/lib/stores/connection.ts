import { derived, writable } from 'svelte/store';
import { normalizeMac, type ConnectionMode } from '$utils/network';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'prompt';

export interface ConnectionState {
  ipAddress: string;
  clientKey: string;
  macAddress: string;
  connectionMode: ConnectionMode;
  selectedTvName: string | null;
  status: ConnectionStatus;
  statusMessage: string;
}

export interface TvSummary {
  name: string;
  ip: string;
  macAddress?: string;
  clientKey?: string;
}

const STORAGE_KEY = 'webos-remote-ui:connection';
const hasStorage = typeof globalThis !== 'undefined' && 'localStorage' in globalThis;

const defaultState: ConnectionState = {
  ipAddress: '',
  clientKey: '',
  macAddress: '',
  connectionMode: 'manual',
  selectedTvName: null,
  status: 'disconnected',
  statusMessage: 'לא מחובר'
};

function loadFromStorage(): ConnectionState {
  if (!hasStorage) return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<ConnectionState>;
    return {
      ...defaultState,
      ...parsed,
      macAddress: parsed.macAddress ? normalizeMac(parsed.macAddress) : ''
    } satisfies ConnectionState;
  } catch (error) {
    console.warn('Failed to read connection settings from storage', error);
    return defaultState;
  }
}

function persistState(state: ConnectionState) {
  if (!hasStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist connection settings', error);
  }
}

const internalStore = writable<ConnectionState>(loadFromStorage());

if (hasStorage) {
  internalStore.subscribe((state) => {
    persistState(state);
  });
}

function createConnectionStore() {
  const { subscribe, update, set } = internalStore;

  return {
    subscribe,
    reset() {
      set(defaultState);
    },
    setStatus(status: ConnectionStatus, message: string) {
      update((state) => ({ ...state, status, statusMessage: message }));
    },
    setConnectionMode(mode: ConnectionMode) {
      update((state) => ({ ...state, connectionMode: mode }));
    },
    updateManual({ ipAddress, clientKey, macAddress }: { ipAddress?: string; clientKey?: string; macAddress?: string }) {
      update((state) => ({
        ...state,
        ipAddress: ipAddress ?? state.ipAddress,
        clientKey: clientKey ?? state.clientKey,
        macAddress: macAddress ? normalizeMac(macAddress) : state.macAddress
      }));
    },
    selectTv(tv: TvSummary | null) {
      update((state) => ({
        ...state,
        selectedTvName: tv?.name ?? null,
        ipAddress: tv?.ip ?? state.ipAddress,
        clientKey: tv?.clientKey ?? state.clientKey,
        macAddress: tv?.macAddress ? normalizeMac(tv.macAddress) : state.macAddress
      }));
    }
  };
}

export const connectionStore = createConnectionStore();

export const isConnectedStore = derived(connectionStore, ($state) => $state.status === 'connected');
