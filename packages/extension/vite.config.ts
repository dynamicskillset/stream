import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [preact()],

  // public/ is copied verbatim into dist/ — contains manifest.json and icons/
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // HTML entry — Vite processes it and rewrites the script tag
        main:       resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        // Flat filenames so manifest.json can reference them without paths
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },

  resolve: {
    alias: {
      'stream-core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
