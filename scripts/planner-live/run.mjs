import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/planner-live-'));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_PLANNER_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/planner-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
const timeout = setTimeout(() => child.kill(), 180000);
child.once('exit', code => { clearTimeout(timeout); console.log(JSON.stringify({ directory, code })); process.exitCode = code ?? 1; });
