// BagLib research editor: offline static build of BlockSuite v0.27.4 (KEY-362).
// Served later from app://-/research-editor/ (RE-2), so every URL is relative and nothing loads
// from a CDN. Sourcemaps are off to keep the optional install component small.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [wasm(), vanillaExtractPlugin()],
  esbuild: { target: 'es2022' },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: [
      // @blocksuite/icons ships React components next to its Lit icons; the editor only uses the Lit
      // ones, so React's JSX runtime is replaced by a stub instead of bundling React.
      { find: 'react/jsx-runtime', replacement: resolve(here, 'src/stubs/react-jsx-runtime.js') },
      // Shiki bundles 280+ languages and 40+ themes (~8.5 MB) by default. Replace with a curated stub.
      { find: /^shiki$/, replacement: resolve(here, 'src/stubs/shiki.js') },
    ],
  },
  build: {
    target: 'es2022',
    outDir: resolve(here, '../dist'),
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 10_000,
    rollupOptions: { input: { index: resolve(here, 'index.html') } },
  },
});
