// Live check for the CodeMirror note editor: throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on :3000, real built main.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/note-editor-live-'));
const corpus = setupThrowawayCorpus({ targetDir: directory });

const trimProfile = () => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true });
    }
  }
};

try {
  // A three-page PDF so a page link can be followed.
  const weasyprint = path.resolve('.baglib-data/pdf-engine/weasyprint/weasyprint.exe');
  fs.writeFileSync(
    path.join(directory, 'pages.html'),
    '<html><meta charset="utf-8"><style>@page{size:A5;margin:2cm}p{font-size:20pt;break-after:page}</style><body><p>Page one</p><p>Page two</p><p>Page three</p></body></html>',
  );
  if (spawnSync(weasyprint, [path.join(directory, 'pages.html'), path.join(directory, 'pages.pdf')]).status !== 0) {
    throw new Error('weasyprint failed');
  }

  const env = {
    ...process.env,
    BAGLIB_DATA_DIR: directory,
    BAGLIB_EDITOR_LIVE_DIR: directory,
    BAGLIB_EDITOR_QURAN_AVAILABLE: corpus.quran.available ? '1' : '0',
    BAGLIB_EDITOR_POETRY_AVAILABLE: corpus.poetry.available ? '1' : '0',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  const code = await new Promise(resolve => {
    const child = spawn(
      electron,
      ['scripts/note-editor-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'],
      { env, stdio: 'inherit', windowsHide: true },
    );
    const timer = setTimeout(() => child.kill(), 300_000);
    child.once('exit', exitCode => {
      clearTimeout(timer);
      resolve(exitCode ?? 1);
    });
  });

  process.exitCode = code;
} finally {
  const cleanupReport = corpus.cleanup();
  trimProfile();
  assert.equal(cleanupReport.copiesDeleted, true, 'Corpus copies must be deleted');
  assert.equal(cleanupReport.originalsUnchanged, true, 'Original corpus files must remain unchanged');
  console.log(JSON.stringify({ directory, code: process.exitCode ?? 1, cleanupReport }));
}
