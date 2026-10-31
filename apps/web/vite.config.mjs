import { defineConfig } from 'vite';

// Babylon.js is most of the download and changes far less often than the game:
// ship it as its own chunks so returning players keep it cached across game updates.
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Tiny helpers shared by every chunk (lazy-import preloading, CommonJS interop) get their own
          // chunk; otherwise Rollup may place them inside the Babylon chunk and the start page would have
          // to download the whole 3D engine before it can show anything.
          if (id.includes('vite/preload-helper') || id.includes('commonjsHelpers') || id.includes('vite/modulepreload-polyfill')) return 'runtime';
          if (id.includes('node_modules/@babylonjs/loaders')) return 'babylon-loaders';
          if (id.includes('node_modules/@babylonjs/core')) return 'babylon';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
