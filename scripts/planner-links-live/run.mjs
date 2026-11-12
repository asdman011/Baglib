// KEY-319 live check runner (KEY-236 planner links and month grid): throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on :3000, real built main.
// The Quran pack is copied from a disposable copy and removed afterwards; originals are verified unchanged.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/planner-links-live-'));
const corpus = setupThrowawayCorpus({ targetDir: directory, copyPoetry: false, includeMushafLayout: true });
const trimProfile = () => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true });
};
try {
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_PLANNER_LINKS_DIR: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  process.exitCode = await new Promise(resolve => {
    const child = spawn(electron, ['scripts/planner-links-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 300_000);
    child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
  });
} finally {
  const cleanupReport = corpus.cleanup();
  trimProfile();
  assert.equal(cleanupReport.copiesDeleted, true, 'Corpus copies must be deleted');
  assert.equal(cleanupReport.originalsUnchanged, true, 'Original corpus files must remain unchanged');
  console.log(JSON.stringify({ directory, code: process.exitCode ?? 1, cleanupReport }));
}
