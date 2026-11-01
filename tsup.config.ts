import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main/index.ts', 'src/main/metadata-worker.ts', 'src/main/pdf-text-worker.ts', 'src/main/quran-worker.ts', 'src/main/quran-reader-worker.ts', 'src/main/pdf-editor-worker.ts', 'src/main/poetry-worker.ts', 'src/main/poetry-provision-worker.ts', 'src/preload/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'es2022',
  external: ['electron', 'better-sqlite3'],
  noExternal: ['electron-serve'],
  clean: true,
  ignoreWatch: [
    'out',
    '**/out/**',
    '**/.next/**',
    '**/src/renderer/**',
    '**/.baglib-data/**',
    '**/public/**',
    '**/tools/**',
    '**/docs/**',
    '**/tests/**',
    '**/scripts/**',
    '**/*.md',
  ],
});
