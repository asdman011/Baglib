import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';

export async function runPlannerLive({ script, variable, corpusSetup }) {
  if (process.platform === 'win32') {
    while (execFileSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).toLowerCase().includes('"electron.exe"')) {
      console.log('Waiting for the other Electron run to finish.');
      await new Promise(resolve => setTimeout(resolve, 30_000));
    }
  }
  const root = path.resolve('.baglib-data');
  const directory = fs.mkdtempSync(path.join(root, 'KEY-341-live-'));
  const evidence = path.join(root, 'KEY-341-evidence');
  fs.mkdirSync(evidence, { recursive: true });
  let corpus;
  try {
    corpus = corpusSetup?.(directory);
    const env = { ...process.env, BAGLIB_DATA_DIR: directory, [variable]: directory };
    delete env.ELECTRON_RUN_AS_NODE;
    const code = await new Promise((resolve, reject) => {
      const child = spawn(electron, [script, `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
      const timer = setTimeout(() => { child.kill(); }, 360_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', status => { clearTimeout(timer); resolve(status ?? 1); });
    });
    process.exitCode = code;
  } finally {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.png')) fs.renameSync(path.join(directory, entry.name), path.join(evidence, `${path.basename(path.dirname(script))}-${entry.name}`));
    }
    if (corpus) console.log(JSON.stringify({ cleanup: corpus.cleanup() }));
    if (path.dirname(path.resolve(directory)) !== root || !path.basename(directory).startsWith('KEY-341-live-')) throw new Error('Unexpected cleanup path');
    fs.rmSync(directory, { recursive: true, force: true });
    console.log(JSON.stringify({ evidence, profileDeleted: !fs.existsSync(directory), code: process.exitCode ?? 0 }));
  }
}
