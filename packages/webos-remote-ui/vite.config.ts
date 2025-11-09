import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const proxyTarget = process.env.PROXY_SERVER_ORIGIN ?? 'http://localhost:3005';
const proxyWsTarget = process.env.PROXY_SERVER_WS ?? 'ws://localhost:3005';

export default defineConfig({
  plugins: [sveltekit()],
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
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/setupTests.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage'
    }
  }
});
