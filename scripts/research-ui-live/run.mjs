import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';

// KEY-306 live run: one Electron window, one throwaway profile, the real files in tests/real-files/.
// The profile is deleted at the end; only the evidence screenshots stay in .baglib-data/KEY-306-evidence/.
const dataRoot = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(dataRoot, 'k306-'));
const evidence = path.join(dataRoot, 'KEY-306-evidence');
fs.mkdirSync(evidence, { recursive: true });
let server;
let code = 1;
try {
  let ready = false;
  try { ready = (await fetch('http://127.0.0.1:3000')).ok; } catch {}
  if (!ready) {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { windowsHide: true, stdio: 'ignore' });
    for (let attempt = 0; attempt < 180; attempt++) {
      try { if ((await fetch('http://127.0.0.1:3000')).ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw Error('Renderer unavailable');
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_K306_DIR: directory, BAGLIB_K306_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  code = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['scripts/research-ui-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, windowsHide: true, stdio: 'inherit' });
    const timer = setTimeout(() => child.kill(), 1_200_000);
    child.once('error', reject);
    child.once('exit', result => { clearTimeout(timer); resolve(result ?? 1); });
  });
} finally {
  if (server) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  const resolved = fs.realpathSync(directory);
  if (!resolved.startsWith(dataRoot + path.sep + 'k306-')) throw Error('Cleanup outside task profile refused');
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log('Throwaway profile removed');
}
process.exitCode = code;
