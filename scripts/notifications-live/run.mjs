import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';

const root = fs.realpathSync('.baglib-data');
const profile = fs.mkdtempSync(path.join(root, 'key312-'));
const evidence = path.join(root, 'KEY-312-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(evidence, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitForElectron = async () => {
  if (process.platform !== 'win32') return;
  let announced = false;
  while (execFileSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/NH'], { encoding: 'utf8', windowsHide: true }).toLowerCase().includes('electron.exe')) {
    if (!announced) { console.log('Waiting for existing Electron processes to exit.'); announced = true; }
    await pause(1000);
  }
};
const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_KEY312_PROFILE: profile, BAGLIB_KEY312_EVIDENCE: evidence, BAGLIB_DEV_URL: 'http://localhost:3000' };
delete env.ELECTRON_RUN_AS_NODE;
let server;
let code = 1;
try {
  let ready = false;
  try { ready = (await fetch('http://localhost:3000')).ok; } catch {}
  if (!ready) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: ['ignore', fs.openSync(path.join(evidence, 'next.log'), 'a'), fs.openSync(path.join(evidence, 'next.err'), 'a')], windowsHide: true });
    for (let attempt = 0; attempt < 180; attempt++) {
      try { if ((await fetch('http://localhost:3000')).ok) { ready = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error('Owned renderer failed to start');
      await pause(500);
    }
  }
  if (!ready) throw new Error('Renderer unavailable');
  for (const phase of ['schedule', 'restart']) {
    await waitForElectron();
    code = await new Promise((resolve, reject) => {
      const log = fs.openSync(path.join(evidence, phase + '.log'), 'a');
      const child = spawn(electron, ['scripts/notifications-live/main.cjs', `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion'], { env: { ...env, BAGLIB_KEY312_PHASE: phase }, stdio: ['ignore', log, log], windowsHide: true });
      child.once('error', reject);
      child.once('exit', status => { fs.closeSync(log); resolve(status ?? 1); });
    });
    if (code) break;
  }
} finally {
  if (server) server.kill();
  await waitForElectron();
  const target = fs.realpathSync(profile);
  if (!target.startsWith(root + path.sep) || !path.basename(target).startsWith('key312-')) throw new Error('Unsafe profile cleanup path');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  fs.writeFileSync(path.join(evidence, 'cleanup.json'), JSON.stringify({ profile, removed: !fs.existsSync(profile), code }, null, 2));
}
console.log(JSON.stringify({ evidence, code }));
process.exitCode = code;
