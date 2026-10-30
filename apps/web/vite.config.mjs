import { defineConfig } from 'vite';

// Babylon.js is most of the download and changes far less often than the game:
// ship it as its own chunks so returning players keep it cached across game updates.
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@babylonjs/loaders')) return 'babylon-loaders';
          if (id.includes('node_modules/@babylonjs/core')) return 'babylon';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
