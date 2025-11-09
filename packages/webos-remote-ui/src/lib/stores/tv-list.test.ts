import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { tvListStore } from './tv-list';

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

describe('tvListStore', () => {
  beforeEach(() => {
    localStorage.clear();
    tvListStore.clearCache();
    mockFetch.mockReset();
  });

  it('loads TV list from the backend and caches it', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        { name: 'Living Room', ip: '10.0.0.20', 'mac-address': '00:11:22:33:44:55', 'secert-key': 'secret' }
      ]
    });

    await tvListStore.load(true);

    const state = get(tvListStore);
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ name: 'Living Room', macAddress: '00:11:22:33:44:55' });

    expect(localStorage.getItem('webos-remote-ui:tv-list')).toBeTruthy();
  });

  it('falls back to cached data on failure', async () => {
    const cached = [
      { name: 'Bedroom', ip: '10.0.0.30', 'mac-address': 'AA:BB:CC:DD:EE:FF', 'secert-key': 'cached' }
    ];
    localStorage.setItem('webos-remote-ui:tv-list', JSON.stringify(cached));

    mockFetch.mockRejectedValue(new Error('Network error'));

    await tvListStore.load();

    const state = get(tvListStore);
    expect(state.status).toBe('ready');
    expect(state.items[0]).toMatchObject({ name: 'Bedroom' });
  });
});
