import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import electron from 'electron';

const output = path.resolve('.baglib-data/tts-live');
const directory = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(output, { recursive: true });
for (const entry of ['main', 'preload', 'renderer']) {
  buildSync({
    entryPoints: [path.join(directory, `${entry}.ts`)],
    outfile: path.join(output, `${entry}.js`),
    bundle: true,
    platform: entry === 'renderer' ? 'browser' : 'node',
    format: entry === 'renderer' ? 'iife' : 'cjs',
    external: ['electron'],
  });
}
fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html><html><body><div id="root"></div><script src="renderer.js"></script></body></html>');
const environment = { ...process.env, HF_HUB_OFFLINE: '1' };
delete environment.ELECTRON_RUN_AS_NODE;
const result = spawnSync(electron, [path.join(output, 'main.js')], {
  stdio: 'inherit', env: environment, windowsHide: true, timeout: 120000,
});
if (result.error) console.error(result.error);
process.exitCode = result.status ?? 1;
