import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  // Relative base so a production build can be served from a subdirectory
  // (this is what CRA's `"homepage": "./"` used to do).
  base: './',
  plugins: [react(), wasm()],
  optimizeDeps: {
    // `physm-rs` is a `file:` dependency rebuilt by `npm run wasm`, and its
    // wasm-bindgen glue is handled by vite-plugin-wasm rather than esbuild.
    exclude: ['physm-rs'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
});
