// Live check for the CodeMirror note editor: throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on :3000, real built main.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
const directory = fs.mkdtempSync(path.resolve('.baglib-data/note-editor-live-'));
// A three-page PDF so a page link can be followed.
const weasyprint = path.resolve('.baglib-data/pdf-engine/weasyprint/weasyprint.exe');
fs.writeFileSync(path.join(directory, 'pages.html'), '<html><meta charset="utf-8"><style>@page{size:A5;margin:2cm}p{font-size:20pt;break-after:page}</style><body><p>Page one</p><p>Page two</p><p>Page three</p></body></html>');
if (spawnSync(weasyprint, [path.join(directory, 'pages.html'), path.join(directory, 'pages.pdf')]).status !== 0) throw new Error('weasyprint failed');
// Disposable copy of the installed Quran packs and the read-only Sunnah corpus, as in the Wave 5 live check.
const packs = path.resolve('.baglib-data/wave10-quran-copy');
if (!fs.existsSync(path.join(packs, 'catalog.sqlite'))) throw new Error('Disposable Quran copy required');
fs.writeFileSync(path.join(directory, 'quran-location.json'), JSON.stringify({ directory: packs }));
fs.mkdirSync(path.join(directory, 'sunnah'));
fs.writeFileSync(path.join(directory, 'sunnah', 'research-source.json'), JSON.stringify({ filename: path.resolve('tools/hadith-alignment/data/output/sunnah_merged_quranlab_v1.sqlite') }));
// Disposable copy of the installed Al-Bayan poetry partition (the original is only read), where the app looks for it.
const poetry = path.join(process.env.APPDATA, 'baglib', 'partitions', 'bayan_poetry.sqlite');
if (!fs.existsSync(poetry)) throw new Error('Installed poetry partition not found');
fs.mkdirSync(path.join(directory, 'partitions'));
fs.copyFileSync(poetry, path.join(directory, 'partitions', 'bayan_poetry.sqlite'));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_EDITOR_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/note-editor-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 300000);
// Keep screenshots and results; drop the profile folders (the app installs about 630 MB of Quran packs into each).
const trimProfile = () => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true }); };
child.once('exit', code => { clearTimeout(timer); trimProfile(); fs.rmSync(path.join(directory, 'partitions'), { recursive: true, force: true }); // the 1.6 GB poetry copy
  console.log(JSON.stringify({ directory, code })); process.exitCode = code ?? 1; });
