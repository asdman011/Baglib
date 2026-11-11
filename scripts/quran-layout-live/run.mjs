import { buildSync } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';
const root = path.resolve('.baglib-data/quran-layout-live'); fs.mkdirSync(root, { recursive: true }); const directory = fs.mkdtempSync(path.join(root, 'run-'));
// KEY-317: without an explicit profile, copy the installed Quran packs (local copy, no download) into a throwaway profile.
const corpus = process.env.BAGLIB_QURAN_LAYOUT_PROFILE ? null : setupThrowawayCorpus({ targetDir: path.join(directory, 'profile'), copyPoetry: false, linkSunnah: false, includeMushafLayout: true });
const profile = path.resolve(process.env.BAGLIB_QURAN_LAYOUT_PROFILE || path.join(directory, 'profile'));
if (!fs.existsSync(path.join(profile, 'quran'))) throw new Error('No installed Quran packs were found to copy; install the Quran pack or set BAGLIB_QURAN_LAYOUT_PROFILE.');
buildSync({ entryPoints: ['scripts/quran-layout-live/main.ts'], outfile: path.join(directory, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
for (const worker of ['quran-reader-worker.js', 'quran-worker.js']) fs.copyFileSync(path.join('dist/main', worker), path.join(directory, worker));
buildSync({ entryPoints: ['scripts/quran-layout-live/fixture.tsx'], outfile: path.join(directory, 'fixture.js'), bundle: true, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } });
const css = fs.readFileSync('src/renderer/app/globals.css', 'utf8').replace('@import "./ui-motion.css";', fs.readFileSync('src/renderer/app/ui-motion.css', 'utf8')) + '\n@source "../../../src/renderer/components";';
fs.writeFileSync(path.join(directory, 'style.css'), (await postcss([tailwind()]).process(css, { from: path.join(directory, 'input.css') })).css);
fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><html class="dark"><meta charset="utf-8"><link rel="stylesheet" href="style.css"><body><div id="root"></div><script src="fixture.js"></script></body></html>');
const env = { ...process.env, BAGLIB_QURAN_LAYOUT_DIRECTORY: directory, BAGLIB_QURAN_LAYOUT_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [path.join(directory, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true }); const timer = setTimeout(() => child.kill(), 110_000);
child.once('exit', code => {
  clearTimeout(timer); process.exitCode = code ?? 1;
  if (corpus) { const cleanup = corpus.cleanup(); console.log(JSON.stringify({ directory, code, cleanup })); fs.rmSync(path.join(directory, 'profile'), { recursive: true, force: true }); }
});
