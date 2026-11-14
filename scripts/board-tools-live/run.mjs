import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';

const data = path.resolve('.baglib-data');
fs.mkdirSync(data, { recursive: true });
const existingApps = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0'], { encoding: 'utf8', windowsHide: true }).trim();
while (existingApps()) {
  console.log('KEY-244 waiting for existing Electron/Baglib processes');
  await new Promise(resolve => setTimeout(resolve, 30000));
}
const directory = fs.mkdtempSync(path.join(data, 'KEY-244-live-'));
const evidence = path.join(data, 'KEY-244-evidence', 'followup');
fs.mkdirSync(evidence, { recursive: true });
try {
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_KEY244_DIR: directory, BAGLIB_KEY244_EVIDENCE: evidence };
  delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise(resolve => {
    const child = spawn(electron, ['scripts/board-tools-live/main.cjs', '--user-data-dir=' + directory, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
    const timeout = setTimeout(() => child.kill(), 360000);
    child.once('exit', code => { clearTimeout(timeout); resolve(code ?? 1); });
  });
  process.exitCode = code;
} finally {
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), data);
  assert.ok(path.basename(resolved).startsWith('KEY-244-live-'));
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ profileDeleted: !fs.existsSync(resolved) }));
}
