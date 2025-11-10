import { derived, get, writable } from 'svelte/store';
import { resolveProxyPath } from '$utils/env';
import { normalizeMac } from '$utils/network';

export interface TvInfo {
  name: string;
  ip: string;
  macAddress?: string;
  clientKey?: string;
}

type TvListStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TvListState {
  status: TvListStatus;
  items: TvInfo[];
  error?: string;
  lastUpdated?: number;
}

const STORAGE_KEY = 'webos-remote-ui:tv-list';
const STORAGE_TIMESTAMP_KEY = 'webos-remote-ui:tv-list-timestamp';
const hasStorage = typeof globalThis !== 'undefined' && 'localStorage' in globalThis;

const initialState: TvListState = {
  status: 'idle',
  items: []
};

function readCachedList(): TvInfo[] | null {
  if (!hasStorage) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(raw) as any[];
    return parsed.map((item) => ({
      name: item.name,
      ip: item.ip,
      macAddress: item['mac-address'] ?? item.macAddress,
      clientKey: item['client-key'] ?? item.clientKey
    } satisfies TvInfo));
  } catch (error) {
    console.warn('Failed to read cached TV list', error);
    return null;
  }
}

async function fetchTvList(): Promise<TvInfo[]> {
  const response = await fetch(resolveProxyPath('./tv-list.json'));
  if (!response.ok) {
    throw new Error(`Failed to load TV list (${response.status})`);
  }
  const data = (await response.json()) as Array<Record<string, string>>;
  return data.map((item) => ({
    name: item.name,
    ip: item.ip?.trim(),
    macAddress: item['mac-address'] ? normalizeMac(item['mac-address']) : undefined,
    clientKey: item['client-key'] ?? item['client-key']
  } satisfies TvInfo));
}

function persistList(list: TvInfo[]) {
  if (!hasStorage) return;
  try {
    const payload = list.map((item) => ({
      name: item.name,
      ip: item.ip,
      'mac-address': item.macAddress,
      'client-key': item.clientKey
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(STORAGE_TIMESTAMP_KEY, Date.now().toString());
  } catch (error) {
    console.warn('Failed to persist TV list', error);
  }
}

function createTvListStore() {
  const { subscribe, set, update } = writable<TvListState>(initialState);

  async function load(force = false) {
    if (!hasStorage) return;

    if (!force) {
      const cached = readCachedList();
      if (cached && cached.length && hasStorage) {
        set({ status: 'ready', items: cached, lastUpdated: Number(localStorage.getItem(STORAGE_TIMESTAMP_KEY) ?? 0) });
      }
    }

    update((state) => ({ ...state, status: 'loading', error: undefined }));

    try {
      const items = await fetchTvList();
      persistList(items);
      set({ status: 'ready', items, lastUpdated: Date.now() });
    } catch (error) {
      console.error('Failed to load TV list', error);
      update((state) => ({
        ...state,
        status: state.items.length ? 'ready' : 'error',
        error: error instanceof Error ? error.message : 'שגיאה בטעינת רשימת הטלוויזיות'
      }));
    }
  }

  return {
    subscribe,
    load,
    clearCache() {
      if (!hasStorage) return;
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_TIMESTAMP_KEY);
      set(initialState);
    }
  };
}

export const tvListStore = createTvListStore();

export const tvOptionsStore = derived(tvListStore, ($state) => $state.items);

export function findTvByName(name: string | null | undefined): TvInfo | undefined {
  if (!name) return undefined;
  const state = get(tvListStore);
  return state.items.find((item) => item.name === name);
}
