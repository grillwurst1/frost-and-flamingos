import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const serverPort = Number(process.env.FF_SERVER_PORT ?? 3000);
const clientPort = Number(process.env.FF_CLIENT_PORT ?? 5173);
const previewPort = Number(process.env.FF_PREVIEW_PORT ?? 4173);
const target = `http://127.0.0.1:${serverPort}`;
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
    port: clientPort,
    strictPort: true,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: previewPort,
    strictPort: true,
    proxy,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 5000,
    sourcemap: false,
  },
});
