import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';

const root = fs.realpathSync('.baglib-data');
const profile = fs.mkdtempSync(path.join(root, 'k301-'));
const evidence = path.join(root, 'KEY-301-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const inputs = ['ar', 'en'].map(language => manifest.files.filter(file => file.kind === 'pdf' && file.lang === language && file.textLayer === 'yes').sort((a, b) => a.bytes - b.bytes)[0]);
fs.writeFileSync(path.join(profile, 'inputs.json'), JSON.stringify(inputs.map(file => ({ ...file, filename: path.resolve('tests/real-files', file.path) }))));
const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_KEY301_DIR: profile, BAGLIB_KEY301_EVIDENCE: evidence };
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
    const log = fs.openSync(path.join(evidence, 'electron.log'), 'a');
    const child = spawn(electron, ['scripts/feedback-ui-live/main.cjs', `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: ['ignore', log, log], windowsHide: true });
    const timer = setTimeout(() => child.kill(), 1200000);
    child.once('error', reject);
    child.once('exit', status => { clearTimeout(timer); resolve(status ?? 1); });
  });
} finally {
  if (server) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  const target = fs.realpathSync(profile);
  if (!target.startsWith(root + path.sep) || !path.basename(target).startsWith('k301-')) throw new Error('Unsafe cleanup target');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  fs.writeFileSync(path.join(evidence, 'cleanup.json'), JSON.stringify({ profile, removed: !fs.existsSync(profile), code }, null, 2));
}
console.log(JSON.stringify({ evidence, code }));
process.exitCode = code;
