import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { connectionStore } from './connection';

const STORAGE_KEY = 'webos-remote-ui:connection';

describe('connectionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    connectionStore.reset();
  });

  it('normalizes MAC addresses and persists state', () => {
    connectionStore.updateManual({ ipAddress: '192.168.1.10', macAddress: 'aa-bb-cc-dd-ee-ff' });
    connectionStore.updateManual({ clientKey: 'secret' });

    const snapshot = get(connectionStore);
    expect(snapshot.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(snapshot.ipAddress).toBe('192.168.1.10');

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(stored.macAddress).toBe('AA:BB:CC:DD:EE:FF');
    expect(stored.ipAddress).toBe('192.168.1.10');
  });

  it('tracks connection status messages', () => {
    connectionStore.setStatus('connecting', 'מתחבר...');
    let snapshot = get(connectionStore);
    expect(snapshot.status).toBe('connecting');
    expect(snapshot.statusMessage).toBe('מתחבר...');

    connectionStore.setStatus('connected', 'מחובר!');
    snapshot = get(connectionStore);
    expect(snapshot.status).toBe('connected');
    expect(snapshot.statusMessage).toBe('מחובר!');
  });
});
