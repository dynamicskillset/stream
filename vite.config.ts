import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Root config is the shared baseline.
// Individual packages extend this with their own vite.config.ts.
export default defineConfig({
  plugins: [preact()],
});
