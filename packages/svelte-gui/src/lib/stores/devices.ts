import { readable } from 'svelte/store';
import type { ApiDevice } from '$lib/api';
import { getDevices } from '$lib/api';
import { browser } from '$app/environment';

/**
 * A readable Svelte store that polls for the list of UPnP devices.
 */
export const devices = readable<ApiDevice[]>([], (set) => {
  async function fetchAndSetDevices() {
    try {
      const deviceList = await getDevices();
      set(deviceList);
    } catch (error) {
      console.error('Error fetching devices:', error);
      // Optional: set an error state in the store
      // set({ error: 'Failed to fetch devices' });
    }
  }

  // Fetch immediately on subscription and then poll, but only in the browser
  if (browser) {
    fetchAndSetDevices();
    const interval = setInterval(fetchAndSetDevices, 5000);

    // Stop polling when there are no more subscribers
    return () => {
      clearInterval(interval);
    };
  }
});