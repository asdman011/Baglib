import { buildSync } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import electron from 'electron';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

// KEY-351 live run: works on a throwaway COPY of the installed poetry corpus; originals are only read and hash-verified.
const root = path.resolve('.baglib-data/poetry-stack-live');
fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, 'run-'));
const evidence = path.resolve('.baglib-data/KEY-351-evidence');
fs.mkdirSync(evidence, { recursive: true });
const corpus = setupThrowawayCorpus({ targetDir: directory, copyQuran: false, copyPoetry: true, linkSunnah: false });

if (!corpus.poetry.available) {
  corpus.cleanup();
  console.log('SKIPPED: no installed poetry partition');
  process.exitCode = 2;
} else {
  try {
    const bundle = (entry, outfile, extra = {}) => buildSync({ entryPoints: [entry], outfile: path.join(directory, outfile), bundle: true, ...extra });
    bundle('src/main/poetry-worker.ts', 'poetry-worker.cjs', { platform: 'node', format: 'cjs', packages: 'external' });
    bundle('src/preload/index.ts', 'preload.cjs', { platform: 'node', format: 'cjs', packages: 'external' });
    bundle('scripts/poetry-stack-live/main.ts', 'main.cjs', { platform: 'node', format: 'cjs', packages: 'external' });
    bundle('scripts/poetry-stack-live/fixture.tsx', 'fixture.js', { platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } });
    fs.cpSync('src/renderer/public/assets/poetry-fonts', path.join(directory, 'fonts'), { recursive: true });
    fs.copyFileSync('src/renderer/app/ui-motion.css', path.join(directory, 'ui-motion.css'));
    const css = fs.readFileSync('src/renderer/app/globals.css', 'utf8').replaceAll('/assets/poetry-fonts/', './fonts/') + '\n@source "../../../src/renderer/components";';
    fs.writeFileSync(path.join(directory, 'style.css'), (await postcss([tailwind()]).process(css, { from: path.join(directory, 'input.css') })).css);
    fs.writeFileSync(path.join(directory, 'index.html'), '<!doctype html><html class="dark"><meta charset="utf-8"><link rel="stylesheet" href="style.css"><body style="height:100vh"><div id="root" style="height:100%"></div><script src="fixture.js"></script></body></html>');
    const env = { ...process.env, BAGLIB_POETRY_STACK_LIVE: directory, BAGLIB_POETRY_STACK_EVIDENCE: evidence, BAGLIB_POETRY_PARTITION: corpus.poetry.file, HF_HUB_OFFLINE: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    process.exitCode = await new Promise(resolve => {
      const child = spawn(electron, [path.join(directory, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
      const timer = setTimeout(() => child.kill(), 240_000);
      child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
    });
  } finally {
    try { console.log('Corpus cleanup:', JSON.stringify(corpus.cleanup())); } catch (error) { console.error(error); process.exitCode = 1; }
  }
}
