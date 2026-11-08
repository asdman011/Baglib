// Live check for the Markdown export (S7): throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on 127.0.0.1:3000, real built main.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
const directory = fs.mkdtempSync(path.resolve('.baglib-data/export-live-'));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_EXPORT_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/export-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 300000);
// Keep screenshots and results; drop the profile folders (the app installs about 630 MB of Quran packs into each).
const trimProfile = () => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory() && entry.name !== 'picked') fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true }); };
child.once('exit', code => { clearTimeout(timer); trimProfile(); console.log(JSON.stringify({ directory, code })); process.exitCode = code ?? 1; });
