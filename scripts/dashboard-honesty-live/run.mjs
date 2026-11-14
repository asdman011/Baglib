import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

const existingApps = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0'], { encoding: 'utf8', windowsHide: true }).trim();
const waitForSlot = async () => {
  while (existingApps()) {
    console.log('KEY-238 waiting for existing Electron/Baglib processes');
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
};
await waitForSlot();
const data = path.resolve('.baglib-data');
const profile = fs.mkdtempSync(path.join(data, 'KEY-238-live-'));
const evidence = path.join(data, 'KEY-238-evidence');
fs.mkdirSync(evidence, { recursive: true });
let renderer;
try {
  if (!await rendererAnswers()) {
    renderer = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', 'localhost'], { stdio: 'ignore', windowsHide: true });
    for (let attempt = 0; attempt < 60 && !await rendererAnswers(); attempt++) await new Promise(resolve => setTimeout(resolve, 1000));
    assert.ok(await rendererAnswers(), 'renderer ready');
  }
  await waitForSlot();
  const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_KEY238_PROFILE: profile, BAGLIB_KEY238_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise(resolve => {
    const child = spawn(electron, ['scripts/dashboard-honesty-live/main.cjs', '--user-data-dir=' + profile], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 180000);
    child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
  });
  assert.equal(code, 0, 'native dashboard checks');
} finally {
  if (renderer?.pid) {
    try { execFileSync('taskkill', ['/pid', String(renderer.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* owned renderer already exited */ }
  }
  assert.equal(path.dirname(path.resolve(profile)), data);
  assert.ok(path.basename(profile).startsWith('KEY-238-live-'));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ profileDeleted: !fs.existsSync(profile) }));
}
