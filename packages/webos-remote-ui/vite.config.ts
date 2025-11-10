import devtoolsJson from 'vite-plugin-devtools-json';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';

const proxyTarget = process.env.PROXY_SERVER_ORIGIN ?? 'http://localhost:3005';
const proxyWsTarget = process.env.PROXY_SERVER_WS ?? 'ws://localhost:3005';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    devtoolsJson()
  ],
    server: {
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/proxy': {
        target: proxyTarget,
        changeOrigin: true
      },
      '/ws': {
        target: proxyWsTarget,
        ws: true,
        changeOrigin: true
      }
    }
  },
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: './vite.config.ts',
        test: {
          name: 'client',
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', headless: true }]
          },
          include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
          exclude: ['src/lib/server/**']
        }
      },
      {
        extends: './vite.config.ts',
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{js,ts}'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
        }
      }
    ]
  }
});
