import { buildSync } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
const root = path.resolve('.baglib-data/pdf-workstation-live'); fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'run-'));
fs.cpSync('src/renderer/public/vendor/pdfjs', path.join(directory, 'vendor/pdfjs'), { recursive: true });
buildSync({ entryPoints: ['scripts/pdf-workstation-live/main.ts'], outfile: path.join(directory, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
buildSync({ entryPoints: ['scripts/pdf-workstation-live/fixture.tsx'], outfile: path.join(directory, 'fixture.js'), bundle: true, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } });
const css = fs.readFileSync('src/renderer/app/globals.css', 'utf8') + '\n@source "../../../src/renderer/components";';
fs.copyFileSync('src/renderer/app/ui-motion.css', path.join(directory, 'ui-motion.css'));
fs.writeFileSync(path.join(directory, 'style.css'), (await postcss([tailwind()]).process(css, { from: path.join(directory, 'input.css') })).css);
fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><html class="dark"><meta charset="utf-8"><link rel="stylesheet" href="style.css"><body><div id="root"></div><script src="fixture.js"></script></body></html>');
const env = { ...process.env, BAGLIB_PDF_LIVE_DIRECTORY: directory }; delete env.ELECTRON_RUN_AS_NODE;
const runLaunch = extraEnv => new Promise(resolve => {
  const child = spawn(electron, [path.join(directory, 'main.cjs')], { env: { ...env, ...extraEnv }, stdio: 'inherit', windowsHide: true });
  const timer = setTimeout(() => child.kill(), process.env.BAGLIB_TEST_ORGANIZER_OUTPUTS === '1' || process.env.BAGLIB_TEST_ORGANIZER_DRAFT === '1' ? 300_000 : 110_000);
  child.once('exit', code => {
    clearTimeout(timer);
    resolve(code ?? 1);
  });
});
let code = await runLaunch(process.env.BAGLIB_TEST_ORGANIZER_DRAFT === '1' ? { BAGLIB_ORGANIZER_DRAFT_LAUNCH: '1' } : {});
if (code === 0 && process.env.BAGLIB_TEST_ORGANIZER_DRAFT === '1') {
  code = await runLaunch({ BAGLIB_ORGANIZER_DRAFT_LAUNCH: '2' });
}
if (process.env.BAGLIB_TEST_LARGE_RANGE === '1') {
  const source = path.resolve(directory, 'source.pdf');
  if (!source.startsWith(root + path.sep)) throw new Error('invalid fixture cleanup path');
  if (fs.existsSync(source)) fs.unlinkSync(source);
}
process.exitCode = code;
