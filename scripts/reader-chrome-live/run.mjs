import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import electron from 'electron';

const dataRoot = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(dataRoot, 'k303-'));
const evidence = path.join(dataRoot, 'KEY-303-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const entries = ['ar', 'en'].map(language => manifest.files.filter(file => file.kind === 'pdf' && file.lang === language && file.textLayer === 'yes').sort((a, b) => a.bytes - b.bytes)[0]);
entries.push(manifest.files.filter(file => file.kind === 'epub' && file.lang === 'en').sort((a, b) => a.bytes - b.bytes)[0]);
const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const files = entries.map((entry, index) => ({ ...entry, filename: path.resolve('tests/real-files', entry.path), id: `key303-${index}`, title: `KEY303 ${entry.kind} ${entry.lang} عِلْم Knowledge` }));
for (const file of files) file.before = hash(file.filename);
fs.writeFileSync(path.join(directory, 'inputs.json'), JSON.stringify(files));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_KEY303_DIR: directory, BAGLIB_KEY303_EVIDENCE: evidence };
delete env.ELECTRON_RUN_AS_NODE;
let server;
let code = 1;
try {
  let ready = false;
  try { ready = (await fetch('http://127.0.0.1:3000')).ok; } catch {}
  if (!ready) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: ['ignore', fs.openSync(path.join(evidence, 'next.log'), 'a'), fs.openSync(path.join(evidence, 'next.err'), 'a')], windowsHide: true });
    for (let attempt = 0; attempt < 180; attempt++) {
      try { if ((await fetch('http://127.0.0.1:3000')).ok) { ready = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error('Owned renderer failed to start');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw new Error('Renderer did not become ready');
  code = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['scripts/reader-chrome-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 1200000);
    child.once('error', reject);
    child.once('exit', status => { clearTimeout(timer); resolve(status ?? 1); });
  });
} finally {
  if (server) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  for (const file of files) if (hash(file.filename) !== file.before) throw new Error(`Original real input changed ${file.filename}`);
  fs.writeFileSync(path.join(evidence, 'inputs.json'), JSON.stringify({ directory, code, files, missingArabicEpub: true }, null, 2));
  if (code === 0) {
    const target = fs.realpathSync(directory);
    if (!target.startsWith(dataRoot + path.sep) || !path.basename(target).startsWith('k303-')) throw new Error('Unsafe cleanup target');
    fs.rmSync(target, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ directory, evidence, code }));
process.exitCode = code;
