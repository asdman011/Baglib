// KEY-271 native app check. Copies real PDFs into an isolated profile, then launches twice.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import electron from 'electron';
const root = path.resolve('.baglib-data');
const resume = process.env.BAGLIB_KEY271_RESUME;
const directory = resume ? fs.realpathSync(resume) : fs.mkdtempSync(path.join(root, 'key271-live-'));
if (!directory.startsWith(root + path.sep) || !path.basename(directory).startsWith('key271-live-')) throw new Error('Unsafe profile');
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const originals = [];
for (const language of ['ar', 'en']) {
  const entry = manifest.files.filter(file => file.kind === 'pdf' && file.lang === language && file.textLayer === 'yes').sort((a, b) => a.bytes - b.bytes)[0];
  const filename = path.resolve('tests/real-files', entry.path);
  originals.push({ filename, sha256: createHash('sha256').update(fs.readFileSync(filename)).digest('hex') });
  if (!resume) fs.copyFileSync(filename, path.join(directory, `${language}.pdf`));
}
const python = path.resolve('.baglib-data/pdf-engine/venv/Scripts/python.exe');
const addForeign = `import pikepdf,sys
for filename in sys.argv[1:]:
 with pikepdf.open(filename,allow_overwriting_input=True) as pdf:
  page=pdf.pages[0]
  annots=list(page.obj.get('/Annots',[]))
  annots.append(pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot,Subtype=pikepdf.Name.Text,Rect=[10,10,30,30],NM='key271-foreign',Contents='Keep foreign annotation',F=4)))
  page.obj.Annots=pikepdf.Array(annots)
  pdf.save(filename)
`;
const made = resume ? { status: 0 } : spawnSync(python, ['-I', '-c', addForeign, path.join(directory, 'ar.pdf'), path.join(directory, 'en.pdf')], { windowsHide: true });
if (made.status !== 0) throw new Error(String(made.stderr));
const launch = phase => new Promise(resolve => {
  const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_KEY271_DIR: directory, BAGLIB_KEY271_PHASE: phase };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, ['scripts/pdf-markup-live/key271.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
  const timer = setTimeout(() => child.kill(), 600000);
  child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
});
let code = resume ? 0 : await launch('first');
if (code === 0) code = await launch('restart');
for (const original of originals) if (createHash('sha256').update(fs.readFileSync(original.filename)).digest('hex') !== original.sha256) throw new Error('Original real PDF changed');
fs.writeFileSync(path.join(directory, 'originals.json'), JSON.stringify(originals));
console.log(JSON.stringify({ directory, code }));
process.exitCode = code;
