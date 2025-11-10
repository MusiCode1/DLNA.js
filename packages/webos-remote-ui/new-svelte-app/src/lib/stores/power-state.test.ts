import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { powerStateStore } from './power-state';
import { wakeService } from '$services/wake-service';

describe('powerStateStore', () => {
  beforeEach(() => {
    powerStateStore.reset();
    vi.restoreAllMocks();
  });

  it('ignores invalid addresses', async () => {
    await powerStateStore.check('not-an-ip', 'AA:BB:CC:DD:EE:FF');
    expect(get(powerStateStore).status).toBe('unknown');
  });

  it('updates state when check succeeds', async () => {
    vi.spyOn(wakeService, 'checkPower').mockResolvedValue({ status: 'offline', message: 'כבוי' });

    await powerStateStore.check('10.0.0.5', 'AA:BB:CC:DD:EE:FF');

    const state = get(powerStateStore);
    expect(state.status).toBe('offline');
    expect(state.message).toBe('כבוי');
  });

  it('handles wake workflow', async () => {
    vi.spyOn(wakeService, 'wake').mockResolvedValue({ status: 'awake', message: 'דולק' });

    await powerStateStore.wake('10.0.0.8', 'AA:BB:CC:DD:EE:FF');

    const state = get(powerStateStore);
    expect(state.status).toBe('awake');
    expect(state.message).toBe('דולק');
    expect(state.isWakeInProgress).toBe(false);
  });
});
