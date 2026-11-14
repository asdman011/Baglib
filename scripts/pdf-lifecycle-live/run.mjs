import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import electron from 'electron';

assert.ok(!execFileSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).toLowerCase().includes('"electron.exe"'), 'Another Electron run is active; leave it untouched and retry later');
const root = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(root, 'k210-'));
const evidence = path.join(root, 'KEY-210-evidence');
fs.mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const entries = manifest.files.filter(file => file.kind === 'pdf' && file.lang === 'ar');
entries.push(manifest.files.filter(file => file.kind === 'pdf' && file.lang === 'en').sort((a, b) => b.bytes - a.bytes)[0]);
const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const files = entries.map(file => ({ ...file, filename: path.resolve('tests/real-files', file.path), before: hash(path.resolve('tests/real-files', file.path)) }));
fs.writeFileSync(path.join(directory, 'inputs.json'), JSON.stringify(files));
fs.cpSync('src/renderer/public/vendor/pdfjs', path.join(directory, 'vendor/pdfjs'), { recursive: true });
await build({ entryPoints: ['scripts/pdf-lifecycle-live/fixture.tsx'], outfile: path.join(directory, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixture-workspace', setup(builder) { builder.onResolve({ filter: /[\/]context[\/]WorkspaceContext$/ }, () => ({ path: path.resolve('scripts/pdf-lifecycle-live/workspace.ts') })); } }] });
await build({ entryPoints: ['scripts/pdf-lifecycle-live/main.ts'], outfile: path.join(directory, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
const css = (await postcss([tailwind()]).process(fs.readFileSync('src/renderer/app/globals.css', 'utf8'), { from: path.resolve('src/renderer/app/globals.css') })).css;
fs.writeFileSync(path.join(directory, 'style.css'), css);
fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><html><meta charset="utf-8"><link rel="stylesheet" href="style.css"><style>body{margin:0;font-family:Arial,sans-serif;line-height:1.6}canvas{max-width:100%}</style><body><div id="root"></div><script src="fixture.js"></script></body></html>');
const env = { ...process.env, BAGLIB_KEY210_DIR: directory, BAGLIB_KEY210_EVIDENCE: evidence };
delete env.ELECTRON_RUN_AS_NODE;
let code;
try {
  code = await new Promise((resolve, reject) => {
    const child = spawn(electron, [path.join(directory, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 300000);
    child.once('error', reject); child.once('exit', value => { clearTimeout(timer); resolve(value); });
  });
  assert.equal(code, 0);
} finally {
  for (const file of files) assert.equal(hash(file.filename), file.before, 'Original PDF changed');
  fs.writeFileSync(path.join(evidence, 'real-file-baselines.json'), JSON.stringify({ files, code, note: 'All available Arabic PDFs used; manifest contains no large Arabic PDF.' }, null, 2));
  const target = fs.realpathSync(directory);
  assert.equal(path.dirname(target), root); assert.ok(path.basename(target).startsWith('k210-'));
  fs.rmSync(target, { recursive: true, force: true });
}
console.log('PASS KEY-210 live, originals unchanged, profile removed');
