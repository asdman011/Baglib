// Live check that the PDF header fits narrow windows: throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on :3000, real built main.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
const directory = fs.mkdtempSync(path.resolve('.baglib-data/pdf-header-live-'));
const weasyprint = path.resolve('.baglib-data/pdf-engine/weasyprint/weasyprint.exe');
const html = `<html><meta charset="utf-8"><style>@page{size:A5;margin:1.5cm}body{font-family:Arial;font-size:15pt;line-height:1.8}</style><body>
<p dir="rtl" lang="ar">العلم قبل القول والعمل، وطلب العلم فريضة على كل مسلم.</p>
<p lang="en">Knowledge comes before speech and action; seeking it is a duty.</p></body></html>`;
fs.writeFileSync(path.join(directory, 'source.html'), html);
const made = spawnSync(weasyprint, [path.join(directory, 'source.html'), path.join(directory, 'markup.pdf')]);
if (made.status !== 0) throw new Error(`weasyprint failed: ${made.stderr}`);
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_HEADER_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/pdf-header-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 300000);
// Keep screenshots and results; drop the profile folders (the app installs about 630 MB of Quran packs into each).
const trimProfile = () => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true }); };
child.once('exit', code => { clearTimeout(timer); trimProfile(); console.log(JSON.stringify({ directory, code })); process.exitCode = code ?? 1; });
