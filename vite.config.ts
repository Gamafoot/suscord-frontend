import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    // RNNoise is loaded through a separate lazy chunk and is intentionally large.
    chunkSizeWarningLimit: 6000,
  },
});
