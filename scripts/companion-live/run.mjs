// Live check for the companion note pane (S10): throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on :3000, real built main.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
const directory = fs.mkdtempSync(path.resolve('.baglib-data/companion-live-'));
const weasyprint = path.resolve('.baglib-data/pdf-engine/weasyprint/weasyprint.exe');
fs.writeFileSync(path.join(directory, 'book.html'), '<html><meta charset="utf-8"><style>@page{size:A5;margin:2cm}p{font-size:18pt;break-after:page}</style><body><p dir="rtl">الصبر ضياء والشكر قيد النعم</p><p>Page two text</p><p>Page three text</p></body></html>');
if (spawnSync(weasyprint, [path.join(directory, 'book.html'), path.join(directory, 'book.pdf')]).status !== 0) throw new Error('weasyprint failed');
// A minute of silence as a stand-in lecture (no real media is used).
const wav = spawnSync('python', ['-I', '-c', 'import sys,wave;w=wave.open(sys.argv[1],"wb");w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000);w.writeframes(b"\\0\\0"*8000*60);w.close()', path.join(directory, 'درس.wav')]);
if (wav.status !== 0) throw new Error(`wav failed: ${wav.stderr}`);
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_COMPANION_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/companion-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion', '--autoplay-policy=no-user-gesture-required'], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 420000);
// Keep screenshots and results; drop the profile folders (the app installs about 630 MB of Quran packs into each).
const trimProfile = () => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true }); };
child.once('exit', code => { clearTimeout(timer); trimProfile(); console.log(JSON.stringify({ directory, code })); process.exitCode = code ?? 1; });
