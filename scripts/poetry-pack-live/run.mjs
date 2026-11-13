// KEY-266 live runner: throwaway profile under .baglib-data, screenshots kept in .baglib-data/KEY-266-evidence.
// Usage: node scripts/poetry-pack-live/run.mjs <path to bayan_poetry-v1.pack.json>
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';

const manifest = path.resolve(process.argv[2] || '.baglib-data/poetry-pack/bayan_poetry-v1.pack.json');
if (!fs.existsSync(manifest)) throw new Error(`missing pack manifest: ${manifest}`);
while (execFileSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).toLowerCase().includes('"electron.exe"')) {
  console.log('Waiting for the other Electron run to finish.');
  await new Promise(resolve => setTimeout(resolve, 30_000));
}
const root = path.resolve('.baglib-data');
const directory = fs.mkdtempSync(path.join(root, 'KEY-266-live-'));
const evidence = path.join(root, 'KEY-266-evidence');
fs.mkdirSync(evidence, { recursive: true });
try {
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_POETRY_PACK_LIVE_DIR: directory, BAGLIB_POETRY_PACK: manifest };
  delete env.ELECTRON_RUN_AS_NODE;
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['scripts/poetry-pack-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 900_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', status => { clearTimeout(timer); resolve(status ?? 1); });
  });
} finally {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isFile() && entry.name.endsWith('.png')) fs.renameSync(path.join(directory, entry.name), path.join(evidence, `poetry-pack-${entry.name}`));
  if (path.dirname(directory) !== root || !path.basename(directory).startsWith('KEY-266-live-')) throw new Error('Unexpected cleanup path');
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  console.log(JSON.stringify({ evidence, profileDeleted: !fs.existsSync(directory), code: process.exitCode ?? 0 }));
}
