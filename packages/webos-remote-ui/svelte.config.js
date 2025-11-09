import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';
import { resolve } from 'node:path';

const buildDir = resolve('..', 'proxy-server', 'public', 'ui-build');

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: buildDir,
      assets: buildDir,
      strict: false
    }),
    alias: {
      $components: './src/lib/components',
      $stores: './src/lib/stores',
      $services: './src/lib/services',
      $utils: './src/lib/utils'
    },
    prerender: {
      entries: ['*']
    }
  }
};

export default config;
