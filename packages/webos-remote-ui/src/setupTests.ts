import { vi } from 'vitest';

if (!globalThis.crypto) {
  // @ts-expect-error - jsdom polyfill
  globalThis.crypto = {};
}

if (!globalThis.crypto.randomUUID) {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  const fallback: Crypto['randomUUID'] = () =>
    template.replace(/[xy]/g, (char) => {
      const rand = Math.floor(Math.random() * 16);
      const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    }) as ReturnType<Crypto['randomUUID']>;

  Object.assign(globalThis.crypto, { randomUUID: fallback });
}

if (!globalThis.fetch) {
  vi.stubGlobal('fetch', vi.fn());
}
