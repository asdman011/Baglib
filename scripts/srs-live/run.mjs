import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/srs-live-'));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_SRS_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const launch = restart => new Promise(resolve => {
  const child = spawn(electron, ['scripts/srs-live/main.cjs', `--user-data-dir=${directory}`], { env: { ...env, BAGLIB_SRS_RESTART: restart ? '1' : '0' }, stdio: 'inherit', windowsHide: true });
  const timeout = setTimeout(() => child.kill(), 180000);
  child.once('exit', code => { clearTimeout(timeout); console.log(JSON.stringify({ directory, restart, code })); resolve(code ?? 1); });
});
const initial = await launch(false);
process.exitCode = initial === 0 ? await launch(true) : initial;
