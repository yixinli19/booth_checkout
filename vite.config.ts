import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { boothCheckoutApiPlugin } from './server/apiServer.ts';

export default defineConfig({
  plugins: [react(), boothCheckoutApiPlugin()],
  cacheDir: '/home/droid/.cache/projects/booth-checkout-56937f7a/vite',
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
