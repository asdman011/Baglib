import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main/index.ts', 'src/preload/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'es2022',
  external: ['electron', 'better-sqlite3'],
  noExternal: ['electron-serve'],
  clean: true,
});
