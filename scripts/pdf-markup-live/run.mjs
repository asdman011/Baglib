// Real PDF markup checks in both interface languages, with disposable input copies.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import electron from 'electron';

const root = fs.realpathSync('.baglib-data');
const evidence = fs.mkdtempSync(path.join(root, 'k317-pdf-markup-evidence-'));
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
for (const fileLanguage of ['ar', 'en']) {
  const file = manifest.files.filter(file => file.kind === 'pdf' && file.lang === fileLanguage && file.textLayer === 'yes').sort((a, b) => a.bytes - b.bytes)[0];
  assert.ok(file, `Missing real ${fileLanguage} PDF`);
  const directory = fs.mkdtempSync(path.join(root, 'pdf-markup-live-'));
  fs.copyFileSync(path.resolve('tests/real-files', file.path), path.join(directory, 'markup.pdf'));
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_MARKUP_LIVE_DIR: directory, BAGLIB_MARKUP_PAGE: fileLanguage === 'en' ? '200' : '2', BAGLIB_REGISTER_PROTOCOL: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(electron, ['scripts/pdf-markup-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 1));
    });
    for (const entry of fs.readdirSync(directory)) {
      if (/\.(png|json|txt)$/.test(entry)) fs.copyFileSync(path.join(directory, entry), path.join(evidence, `${fileLanguage}-${entry}`));
    }
    assert.equal(code, 0, fileLanguage);
  } finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved), root);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ passed: true, evidence }));
