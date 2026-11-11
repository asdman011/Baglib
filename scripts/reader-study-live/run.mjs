import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import electron from 'electron';
const directory = fs.mkdtempSync(path.resolve('.baglib-data/k280-'));
const evidence = path.join(directory, 'evidence'); fs.mkdirSync(evidence);
const profile = path.join(directory, 'profile'); fs.mkdirSync(profile);
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const choose = predicate => { const file = manifest.files.find(predicate); assert.ok(file); return path.resolve('tests/real-files', file.path); };
const files = [
  { id: 'pdf-ar', format: 'PDF', page: 3, path: choose(f => f.kind === 'pdf' && f.lang === 'ar' && f.textLayer === 'yes') },
  { id: 'pdf-en', format: 'PDF', page: 8, path: choose(f => f.kind === 'pdf' && f.lang === 'en' && f.bytes < 2000000) },
  { id: 'epub-en', format: 'EPUB', page: 1, path: choose(f => f.kind === 'epub' && f.bytes < 1000000) },
  { id: 'scan-ar', format: 'PDF', page: 2, path: choose(f => f.kind === 'pdf' && f.textLayer === 'no') },
];
const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_SELECTION_PROFILE: profile, BAGLIB_SELECTION_EVIDENCE: evidence, BAGLIB_SELECTION_FILES: JSON.stringify(files), BAGLIB_REGISTER_PROTOCOL: '0' };
delete env.ELECTRON_RUN_AS_NODE;
try {
  const languages = (process.env.BAGLIB_SELECTION_LANGUAGES || 'ar,en').split(',');
  assert.ok(languages.every(language => ['ar', 'en'].includes(language)));
  for (const lang of languages) {
    const code = await new Promise(resolve => {
      const child = spawn(electron, ['scripts/reader-study-live/main.cjs', `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion'], { env: { ...env, BAGLIB_SELECTION_LANG: lang }, stdio: 'inherit', windowsHide: true });
      child.once('exit', code => { resolve(code ?? 1); });
    }); assert.equal(code, 0, lang);
  }
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ passed: true, directory, files }, null, 2));
} finally {
  assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ directory, profileDeleted: !fs.existsSync(profile) }));
}
