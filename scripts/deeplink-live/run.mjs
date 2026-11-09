import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/deeplink-live-'));
const profile = path.join(directory, 'profile');
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(evidence);
const corpus = setupThrowawayCorpus({ targetDir: profile, copyPoetry: false, linkSunnah: false, includeMushafLayout: true });
const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_DEEPLINK_PROFILE: profile, BAGLIB_DEEPLINK_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0' };
delete env.ELECTRON_RUN_AS_NODE;
try {
  fs.writeFileSync(path.join(profile, 'pages.html'), '<html><style>@page{size:A5}p{break-after:page}</style><p>Page one</p><p>Page two</p><p>Page three</p></html>');
  assert.equal(spawnSync(path.resolve('.baglib-data/pdf-engine/weasyprint/weasyprint.exe'), [path.join(profile, 'pages.html'), path.join(profile, 'pages.pdf')]).status, 0);
  assert.equal(corpus.quran.available, true, 'Installed Quran copy required for acceptance');
  for (const language of ['en', 'ar']) {
    for (const target of ['seed', 'note:link-note#^para', 'book:link-book#p=3', 'quran:hafs:2:255']) {
      const code = await new Promise(resolve => {
        const child = spawn(electron, ['scripts/deeplink-live/main.cjs', `--user-data-dir=${profile}`, ...(target === 'seed' ? [] : [`baglib:${target}`])], { env: { ...env, BAGLIB_DEEPLINK_LANG: language, BAGLIB_DEEPLINK_TARGET: target }, stdio: 'inherit', windowsHide: true });
        const timer = setTimeout(() => child.kill(), 180_000);
        child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
      });
      assert.equal(code, 0, `${language} ${target}`);
    }
  }
  console.log(JSON.stringify({ directory, passed: true }));
} finally {
  const cleanup = corpus.cleanup();
  const resolved = path.resolve(profile);
  assert.equal(path.dirname(resolved), path.resolve(directory));
  fs.rmSync(resolved, { recursive: true, force: true });
  fs.writeFileSync(path.join(evidence, 'cleanup.json'), JSON.stringify(cleanup));
  console.log(JSON.stringify({ directory, cleanup, profileDeleted: !fs.existsSync(profile) }));
}
