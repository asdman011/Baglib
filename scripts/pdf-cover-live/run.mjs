import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';

const root = path.resolve('.baglib-data/pdf-cover-live');
fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'run-'));
const entry = path.join(directory, 'main.cjs');
buildSync({ entryPoints: ['scripts/pdf-cover-live/main.ts'], outfile: entry, bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
buildSync({ entryPoints: ['src/preload/index.ts'], outfile: path.join(directory, 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const env = { ...process.env, BAGLIB_PDF_COVER_TEST_DIRECTORY: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [entry], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 90_000);
child.on('exit', code => { clearTimeout(timer); process.exitCode = code ?? 1; });
child.on('error', error => { clearTimeout(timer); console.error(error); process.exitCode = 1; });
