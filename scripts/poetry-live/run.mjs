import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

if (!(await fetch('http://localhost:3000')).ok) throw Error('Dev renderer required on http://localhost:3000');

const root = path.resolve('.baglib-data/poetry-live');
fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'run-'));
const publicRoot = fs.realpathSync('src/renderer/public');
const publicName = '__poetry-live-' + path.basename(directory);
const publicDirectory = path.join(publicRoot, publicName);
const evidence = fs.mkdtempSync(path.resolve('.baglib-data/k317-poetry-evidence-'));
const corpus = setupThrowawayCorpus({ targetDir: directory, copyQuran: false, copyPoetry: true, linkSunnah: false });

if (!corpus.poetry.available) {
  corpus.cleanup();
  console.log('SKIPPED: no installed poetry partition');
  process.exitCode = 2;
} else {
  try {
    buildSync({ entryPoints: ['src/main/poetry-worker.ts'], outfile: path.join(directory, 'poetry-worker.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
    buildSync({ entryPoints: ['src/preload/index.ts'], outfile: path.join(directory, 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
    buildSync({ entryPoints: ['scripts/poetry-live/main.ts'], outfile: path.join(directory, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
    buildSync({ entryPoints: ['scripts/poetry-live/fixture.tsx'], outfile: path.join(directory, 'fixture.js'), bundle: true, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } });
    fs.cpSync('src/renderer/public/assets/poetry-fonts', path.join(directory, 'fonts'), { recursive: true });
    fs.copyFileSync('src/renderer/app/ui-motion.css', path.join(directory, 'ui-motion.css'));
    const css = fs.readFileSync('src/renderer/app/globals.css', 'utf8').replace('@import "./ui-motion.css";', fs.readFileSync('src/renderer/app/ui-motion.css', 'utf8')).replaceAll('/assets/poetry-fonts/', './fonts/') + '\n@source "../../../src/renderer/components";';
    fs.writeFileSync(path.join(directory, 'style.css'), (await postcss([tailwind()]).process(css, { from: path.join(directory, 'input.css') })).css);
    fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><html class="dark"><meta charset="utf-8"><link rel="stylesheet" href="style.css"><body style="height:100vh"><div id="root" style="height:100%"></div><script src="fixture.js"></script></body></html>');
    fs.mkdirSync(publicDirectory);
    for (const name of ['index.html', 'fixture.js', 'style.css', 'fonts']) fs.cpSync(path.join(directory, name), path.join(publicDirectory, name), { recursive: true });
    const env = { ...process.env, BAGLIB_POETRY_LIVE: directory, BAGLIB_POETRY_RENDERER_URL: `http://localhost:3000/${publicName}/index.html`, BAGLIB_POETRY_PARTITION: corpus.poetry.file, HF_HUB_OFFLINE: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    const code = await new Promise(resolve => {
      const child = spawn(electron, [path.join(directory, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
      child.once('exit', exitCode => {
        resolve(exitCode ?? 1);
      });
    });
    process.exitCode = code;
  } finally {
    try {
      const originals = corpus.cleanup();
      for (const name of fs.readdirSync(directory)) if (/\.(png|json|txt)$/.test(name)) fs.copyFileSync(path.join(directory, name), path.join(evidence, name));
      if (path.dirname(path.resolve(publicDirectory)) !== publicRoot) throw Error('Unexpected public fixture path');
      fs.rmSync(publicDirectory, { recursive: true, force: true });
      const resolved = fs.realpathSync(directory);
      if (path.dirname(resolved) !== fs.realpathSync(root)) throw Error('Unexpected profile path');
      fs.rmSync(resolved, { recursive: true, force: true });
      console.log(JSON.stringify({ evidence, originals, profileDeleted: true, publicFixtureDeleted: true }));
    } catch (verifyError) {
      console.error(verifyError);
      process.exitCode = 1;
    }
  }
}
