import { buildSync } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { createPackage } from '@electron/asar';

const root = path.resolve('.baglib-data/import-live');
fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'run-'));
buildSync({ entryPoints: ['scripts/import-live/fixture.tsx'], outfile: path.join(directory, 'fixture.js'), bundle: true, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } });
for (const [source, target] of [['scripts/import-live/main.ts', 'main.cjs'], ['src/preload/index.ts', 'preload.cjs'], ['src/main/metadata-worker.ts', 'metadata-worker.js']]) {
  buildSync({ entryPoints: [source], outfile: path.join(directory, target), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
}
const archiveSource = path.join(directory, 'worker-package');
fs.mkdirSync(archiveSource);
fs.copyFileSync(path.join(directory, 'metadata-worker.js'), path.join(archiveSource, 'metadata-worker.js'));
await createPackage(archiveSource, path.join(directory, 'worker.asar'));
const styles = fs.readFileSync('src/renderer/app/globals.css', 'utf8') + '\n@source "../../src/renderer/components/library/ImportWizardModal.tsx";';
const css = await postcss([tailwind()]).process(styles, { from: path.join(directory, 'input.css') });
fs.writeFileSync(path.join(directory, 'style.css'), css.css);
fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><html class="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
const env = { ...process.env, BAGLIB_IMPORT_TEST_DIRECTORY: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [path.join(directory, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
const timeout = setTimeout(() => child.kill(), 120_000);
child.on('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
child.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
