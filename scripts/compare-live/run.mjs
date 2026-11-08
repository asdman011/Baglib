// Live check for comparing two editions (Wave 13.1): two generated PDFs that differ in a few words and in tashkeel;
// throwaway BAGLIB_DATA_DIR and --user-data-dir, dev renderer on :3000, real built main.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import electron from 'electron';
const dataRoot = fs.realpathSync('.baglib-data');
const directory = fs.mkdtempSync(path.join(dataRoot, 'compare-live-'));
const weasyprint = path.resolve('.baglib-data/pdf-engine/weasyprint/weasyprint.exe');
const page = (paragraphs) => `<html><meta charset="utf-8"><style>@page{size:A5;margin:1.5cm}body{font-family:Arial;font-size:15pt;line-height:1.8}.b{break-before:page}</style><body>${paragraphs}</body></html>`;
const editionA = page(`<p dir="rtl" lang="ar">العلم قبل القول والعمل، وطلب العلم فريضة على كل مسلم.</p><p class="b" dir="rtl" lang="ar">قال الشيخ رحمه الله: الصَّبْرُ ضِيَاءٌ.</p><p lang="en">Knowledge comes before speech and action.</p>`);
const editionB = page(`<p dir="rtl" lang="ar">العلم قبل القول والعمل، وطلب العلم فريضة واجبة على كل مسلم.</p><p class="b" dir="rtl" lang="ar">قال المصنف رحمه الله: الصبر ضياء.</p><p lang="en">Knowledge comes before speech and deeds.</p>`);
for (const [name, html] of [['a', editionA], ['b', editionB]]) {
  fs.writeFileSync(path.join(directory, `${name}.html`), html);
  const made = spawnSync(weasyprint, [path.join(directory, `${name}.html`), path.join(directory, `${name}.pdf`)]);
  if (made.status !== 0) throw new Error(`weasyprint failed: ${made.stderr}`);
}
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_COMPARE_LIVE_DIR: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['scripts/compare-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 300000);
const trimProfile = () => {
  if (!fs.realpathSync(directory).startsWith(dataRoot + path.sep)) throw new Error('Profile outside temporary data root');
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) if (entry.isDirectory()) {
    const target = path.resolve(directory, entry.name);
    if (!target.startsWith(directory + path.sep)) throw new Error('Invalid profile cleanup target');
    fs.rmSync(target, { recursive: true, force: true });
  }
};
child.once('exit', code => { clearTimeout(timer); trimProfile(); console.log(JSON.stringify({ directory, code })); process.exitCode = code ?? 1; });
