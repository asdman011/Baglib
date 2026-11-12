import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

if (process.platform === 'win32') {
  while (execFileSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).toLowerCase().includes('"electron.exe"')) {
    console.log('Waiting for existing Electron processes to exit.');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

const dataRoot = fs.realpathSync('.baglib-data');
const profile = fs.mkdtempSync(path.join(dataRoot, 'k300p2-'));
const evidence = path.join(dataRoot, 'KEY-300-evidence', 'part2-' + new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const files = manifest.files.filter(file => file.textLayer === 'yes' || file.kind === 'epub').sort((a, b) => {
  if (a.lang !== b.lang) return a.lang === 'ar' ? -1 : 1;
  return a.bytes - b.bytes;
}).map(file => ({ ...file, filename: path.resolve('tests/real-files', file.path) }));
fs.writeFileSync(path.join(profile, 'inputs.json'), JSON.stringify(files));
const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_KEY300_DIR: profile, BAGLIB_KEY300_EVIDENCE: evidence };
delete env.ELECTRON_RUN_AS_NODE;
let server;
let code = 1;
try {
  let ready = await rendererAnswers();
  if (!ready) {
    const log = fs.openSync(path.join(evidence, 'next.log'), 'a');
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: ['ignore', log, log], windowsHide: true });
    for (let attempt = 0; attempt < 180; attempt++) {
      if (await rendererAnswers()) { ready = true; break; }
      if (server.exitCode !== null) throw new Error('Owned renderer failed to start');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw new Error('Renderer unavailable');
  code = await new Promise((resolve, reject) => {
    const log = fs.openSync(path.join(evidence, 'electron.log'), 'a');
    const child = spawn(electron, ['scripts/library-ui-live/detail-main.cjs', '--user-data-dir=' + profile, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: ['ignore', log, log], windowsHide: true });
    child.once('error', reject);
    child.once('exit', status => resolve(status ?? 1));
  });
} finally {
  if (server) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  const target = fs.realpathSync(profile);
  if (!target.startsWith(dataRoot + path.sep) || !path.basename(target).startsWith('k300p2-')) throw new Error('Unsafe cleanup target');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  fs.writeFileSync(path.join(evidence, 'cleanup.json'), JSON.stringify({ profile, removed: !fs.existsSync(profile), code }, null, 2));
}
console.log(JSON.stringify({ evidence, code }));
process.exitCode = code;
