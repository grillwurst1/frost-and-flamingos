import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const target = 'http://127.0.0.1:3000';
const proxy = {
  '/api': {
    target,
    changeOrigin: true,
  },
  '/ws': {
    target: target.replace('http://', 'ws://'),
    ws: true,
  },
};

export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 5000,
    sourcemap: false,
  },
});
