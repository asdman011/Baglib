// Live check for comment threads (ADR-010): throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on :3000, real built main.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
const directory = fs.mkdtempSync(path.resolve('.baglib-data/comments-live-'));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_COMMENTS_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/comments-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
// Keep screenshots and results; drop the profile folders (the app installs about 630 MB of Quran packs into each).
const trimProfile = () => {
  const evidence = fs.mkdtempSync(path.resolve('.baglib-data/k317-comments-evidence-'));
  for (const entry of fs.readdirSync(directory)) {
    if (/\.(png|json|txt)$/.test(entry)) fs.copyFileSync(path.join(directory, entry), path.join(evidence, entry));
  }
  const resolved = fs.realpathSync(directory);
  if (path.dirname(resolved) !== fs.realpathSync('.baglib-data')) throw Error('Unexpected profile path');
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ evidence, profileDeleted: true }));
};
child.once('exit', code => { trimProfile(); console.log(JSON.stringify({ directory, code })); process.exitCode = code ?? 1; });
