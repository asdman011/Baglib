import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import electron from 'electron';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/key279-'));
const profile = path.join(directory, 'profile');
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(profile);
fs.mkdirSync(evidence);
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const files = ['en', 'ar'].map(language => manifest.files.find(file => file.kind === 'pdf' && file.lang === language && file.textLayer === 'yes' && file.bytes < 2_000_000));
assert.ok(files.every(Boolean));
for (const [index, file] of files.entries()) {
  fs.mkdirSync(path.join(profile, String(index)));
  fs.copyFileSync(path.resolve('tests/real-files', file.path), path.join(profile, String(index), 'same.pdf'));
}
const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_STUDY_SOURCE_PROFILE: profile, BAGLIB_STUDY_SOURCE_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0' };
delete env.ELECTRON_RUN_AS_NODE;
try {
  for (const language of ['en', 'ar']) {
    const code = await new Promise(resolve => {
      const child = spawn(electron, ['scripts/study-source-live/main.cjs', `--user-data-dir=${profile}`], { env: { ...env, BAGLIB_STUDY_SOURCE_LANG: language }, stdio: 'inherit', windowsHide: true });
      const timer = setTimeout(() => child.kill(), 240_000);
      child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
    });
    assert.equal(code, 0, language);
  }
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ passed: true, files: files.map(file => file.path), directory }, null, 2));
} finally {
  assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ directory, profileDeleted: !fs.existsSync(profile) }));
}
