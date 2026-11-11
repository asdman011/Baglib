// Starts the real app on a throwaway BAGLIB_DATA_DIR and --user-data-dir. The dev target needs `npm run dev:next` already listening on port 3000.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
fs.mkdirSync(path.resolve('.baglib-data'), { recursive: true });
const directory = fs.mkdtempSync(path.resolve('.baglib-data/next-upgrade-live-'));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_NEXT_LIVE_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/next-upgrade-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
child.once('exit', code => {
  const evidence = fs.mkdtempSync(path.resolve('.baglib-data/k317-next-evidence-'));
  for (const entry of fs.readdirSync(directory)) {
    if (/\.(png|json|txt)$/.test(entry)) fs.copyFileSync(path.join(directory, entry), path.join(evidence, entry));
  }
  const resolved = fs.realpathSync(directory);
  if (path.dirname(resolved) !== fs.realpathSync('.baglib-data')) throw Error('Unexpected profile path');
  fs.rmSync(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ evidence, code, profileDeleted: true }));
  process.exitCode = code ?? 1;
});
