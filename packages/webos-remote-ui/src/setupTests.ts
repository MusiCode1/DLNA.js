import { vi } from 'vitest';

if (!globalThis.crypto) {
  // @ts-expect-error - jsdom polyfill
  globalThis.crypto = {};
}

if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => Math.random().toString(36).slice(2);
}

if (!globalThis.fetch) {
  vi.stubGlobal('fetch', vi.fn());
}
