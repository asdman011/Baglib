import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
const existingApps = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', "Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0"], { encoding: 'utf8', windowsHide: true }).trim();
while (existingApps()) {
  console.log('KEY-364 waiting for existing Electron processes, leaving them untouched');
  await new Promise(resolve => setTimeout(resolve, 30000));
}
const root = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(root, 'k364-'));
const evidence = path.join(root, 'KEY-364-evidence');
fs.mkdirSync(evidence, { recursive: true });
try {
  await build({ entryPoints: ['scripts/manuscripts-live/fixture.tsx'], outfile: path.join(directory, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' } });
  await build({ entryPoints: ['scripts/manuscripts-live/main.ts'], outfile: path.join(directory, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  await build({ entryPoints: ['src/preload/index.ts'], outfile: path.join(directory, 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  // Use the actual bundled fonts for the mixed Arabic/Latin fixture.
  const fonts = fs.readdirSync('assets/pdf-editor/fonts', { recursive: true }).filter(name => typeof name === 'string' && /\.(woff2?|ttf)$/iu.test(name));
  const arabic = fonts.find(name => /noto.*arabic.*regular|arabic.*regular|noto.*arabic/iu.test(name));
  const latin = fonts.find(name => /DejaVuSans/iu.test(name));
  let css = 'body{margin:0;background:#f7f8fa;font-family:FixtureArabic,FixtureLatin,Arial,sans-serif;line-height:1.8}';
  for (const [family, file] of [['FixtureArabic', arabic], ['FixtureLatin', latin]]) if (file) {
    const dest = family + path.extname(file); fs.copyFileSync(path.join('assets/pdf-editor/fonts', file), path.join(directory, dest));
    css += `@font-face{font-family:${family};src:url('${dest}')} `;
  }
  fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><style>' + css + '</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>');
  const env = { ...process.env, BAGLIB_KEY364_DIR: directory, BAGLIB_KEY364_EVIDENCE: evidence, BAGLIB_KEY364_SOURCE_DB: process.env.BAGLIB_KEY364_SOURCE_DB || fs.readdirSync(path.join(process.env.APPDATA, 'baglib/data/migration-backups')).filter(name => name.endsWith('.db')).sort().map(name => path.join(process.env.APPDATA, 'baglib/data/migration-backups', name)).at(-1) };
  delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electron, [path.join(directory, 'main.cjs'), '--user-data-dir=' + directory], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 240000);
    child.once('error', reject); child.once('exit', value => { clearTimeout(timer); resolve(value); });
  });
  assert.equal(code, 0, 'native manuscript checks');
} finally {
  const target = fs.realpathSync(directory);
  assert.equal(path.dirname(target), root); assert.ok(path.basename(target).startsWith('k364-'));
  fs.rmSync(target, { recursive: true, force: true });
  console.log('KEY-364 throwaway profile deleted');
}
