// Live check for unified saving (ADR-012): throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on :3000,
// real built main. Runs the app twice on the same profile to test undo/redo across a restart.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
import { createHash } from 'node:crypto';
if (process.env.BAGLIB_SAVE_APPEARANCE_ONLY === '1') {
  await import('./appearance-run.mjs');
  process.exit(process.exitCode ?? 0);
}
const dataRoot = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(dataRoot, 'save-live-'));
const engine = path.resolve('.baglib-data/pdf-engine');
const html = `<html><meta charset="utf-8"><style>@page{size:A5;margin:1.5cm}body{font-family:Arial;font-size:15pt;line-height:1.8}</style><body>
<p dir="rtl" lang="ar">العلم قبل القول والعمل، وطلب العلم فريضة على كل مسلم.</p>
<p lang="en">Knowledge comes before speech and action; seeking it is a duty.</p><p lang="en">A second line of text for another mark.</p></body></html>`;
fs.writeFileSync(path.join(directory, 'source.html'), html);
const made = spawnSync(path.join(engine, 'weasyprint/weasyprint.exe'), [path.join(directory, 'source.html'), path.join(directory, 'book.pdf')]);
if (made.status !== 0) throw new Error(`weasyprint failed: ${made.stderr}`);
// One annotation made outside BagLib, which every save and export must keep.
const python = path.join(engine, 'venv/Scripts/python.exe');
const outside = spawnSync(python, ['-I', '-c', `import pikepdf,sys
with pikepdf.open(sys.argv[1], allow_overwriting_input=True) as d:
    d.pages[0].obj.Annots=pikepdf.Array([d.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot,Subtype=pikepdf.Name.Text,Rect=[10,10,30,30],Contents=pikepdf.String('from another program'),T=pikepdf.String('someone')))])
    d.save(sys.argv[1])`, path.join(directory, 'book.pdf')]);
if (outside.status !== 0) throw new Error(String(outside.stderr));
const launch = phase => new Promise(resolve => {
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_SAVE_LIVE_DIR: directory, BAGLIB_SAVE_LIVE_PHASE: phase };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ['scripts/save-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
  const timer = setTimeout(() => child.kill(), 420000);
  child.once('exit', code => { clearTimeout(timer); resolve(code); });
});
const first = await launch('first');
const quitOnly = process.env.BAGLIB_SAVE_QUIT_ONLY === '1';
const second = quitOnly ? null : first === 0 ? await launch('restart') : 1;
let finalOk = true;
if (first === 0 && (quitOnly || second === 0)) {
  // The window's Save choice wrote the pending mark before closing.
  const result = JSON.parse(fs.readFileSync(path.join(directory, quitOnly ? 'results-lifecycle.json' : 'results-restart.json'), 'utf8'));
  const expected = result.expectFinalOwned;
  const inspected = JSON.parse(spawnSync(python, ['-I', 'assets/pdf-editor/baglib_marks.py', 'inspect', path.join(directory, 'book.pdf')], { encoding: 'utf8' }).stdout);
  const owned = inspected.owned;
  finalOk = owned === expected && (!quitOnly || inspected.outside === 1);
  if (quitOnly) {
    const backups = fs.readdirSync(path.join(directory, 'emergency-copies'));
    finalOk &&= backups.length === 1 && createHash('sha256').update(fs.readFileSync(path.join(directory, 'emergency-copies', backups[0]))).digest('hex') === result.expectedBackupHash;
  }
  console.log(JSON.stringify({ windowSaveWrote: owned, expected }));
}
// Keep screenshots and results; drop the profile folders (the app installs Quran packs into each).
if (!fs.realpathSync(directory).startsWith(dataRoot + path.sep)) throw new Error('Profile outside temporary data root');
for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory() && entry.name !== 'emergency-copies') {
  const target = path.resolve(directory, entry.name);
  if (!target.startsWith(directory + path.sep)) throw new Error('Invalid profile cleanup target');
  fs.rmSync(target, { recursive: true, force: true });
}
console.log(JSON.stringify({ directory, first, second }));
process.exitCode = first === 0 && (quitOnly || second === 0) && finalOk ? 0 : 1;
