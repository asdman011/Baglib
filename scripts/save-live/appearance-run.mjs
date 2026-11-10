// Opt-in real-file stage. Each UI-language/document-language pair gets its own profile.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
const root = fs.realpathSync('.baglib-data');
const evidence = path.join(root, 'key270-save-live-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(evidence, { recursive: true });
const python = path.join(root, 'pdf-engine/venv/Scripts/python.exe');
const helper = path.resolve('scripts/save-live/appearance_pdf.py');
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const cases = [];
casesLoop: for (const language of ['ar', 'en']) for (const documentLanguage of ['ar', 'en']) {
  const fixture = manifest.files.find(file => file.kind === 'pdf' && file.lang === documentLanguage && file.textLayer === 'yes' && (documentLanguage === 'ar' || file.pages === 240));
  if (!fixture) throw new Error(`Missing ${documentLanguage} real PDF`);
  const source = path.resolve('tests/real-files', fixture.path);
  const sourceHash = hash(source);
  const directory = fs.mkdtempSync(path.join(root, 'k293-'));
  const prefix = `${language}-${documentLanguage}`;
  const output = path.join(evidence, prefix);
  fs.mkdirSync(output);
  const book = path.join(directory, 'book.pdf');
  fs.copyFileSync(source, book);
  execFileSync(python, ['-I', helper, 'prepare', book], { windowsHide: true });
  fs.writeFileSync(path.join(directory, 'appearance-input.json'), JSON.stringify({ language, documentLanguage, source, sourceHash, evidence: output }));
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_SAVE_LIVE_DIR: directory, BAGLIB_SAVE_LIVE_PHASE: 'appearance', BAGLIB_SAVE_APPEARANCE_ONLY: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise(resolve => {
    const child = spawn(electron, ['scripts/save-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 420000);
    child.once('error', error => { clearTimeout(timer); console.error(error); resolve(1); });
    child.once('exit', value => { clearTimeout(timer); resolve(value); });
  });
  if (hash(source) !== sourceHash) throw new Error('Original real file changed');
  cases.push({ language, documentLanguage, directory, evidence: output, code, source, sourceHash });
  fs.writeFileSync(path.join(evidence, 'runs.json'), JSON.stringify(cases, null, 2));
  if (code !== 0) { process.exitCode = 1; break casesLoop; }
  // Preserve the actual saved document and diagnostics before removing only this throwaway profile.
  fs.copyFileSync(book, path.join(output, 'saved.pdf'));
  const target = fs.realpathSync(directory);
  if (!target.startsWith(root + path.sep) || !path.basename(target).startsWith('k293-')) throw new Error('Unsafe cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
}
console.log(JSON.stringify({ evidence, cases }));
