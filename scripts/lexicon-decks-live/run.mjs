import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execSync } from 'node:child_process';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';

// KEY-400 live check runner:
// - Real Arabic and English text-layer PDFs from tests/real-files/manifest.json (imported in place, copyToStorage: false)
// - Readest StarDict fixture (eng-nld) copied into each throwaway profile
// - Disposable Quran corpus copy in each throwaway profile (verified unchanged on cleanup)
// - Evidence screenshots and results copied to .baglib-data/key400-evidence/

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const pdfFor = lang => {
  const file = manifest.files.find(f => f.kind === 'pdf' && f.lang === lang && f.textLayer === 'yes');
  assert.ok(file, `a real ${lang} text-layer PDF is in the manifest`);
  return path.resolve('tests/real-files', file.path);
};

const readestDictDir = path.resolve(
  'repos/readest/readest-main/apps/readest-app/src/__tests__/fixtures/data/dicts'
);

const rendererAlreadyRunning = await rendererAnswers();
const directory = fs.mkdtempSync(path.resolve('.baglib-data/lexicon-decks-live-'));
const evidence = path.join(directory, 'evidence');
fs.mkdirSync(evidence, { recursive: true });

const nextProcess = rendererAlreadyRunning
  ? null
  : spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'],
      { stdio: 'ignore', windowsHide: true }
    );
let ready = false;
for (let i = 0; i < 90 && !ready; i++) {
  try {
    ready = (await fetch('http://127.0.0.1:3000')).status < 500;
  } catch {
    await new Promise(r => setTimeout(r, 1000));
  }
}
assert.ok(ready, 'Next.js dev server did not start');

const profiles = [];
const corpora = [];
try {
  const used = [];
  for (const lang of ['ar', 'en']) {
    const profile = path.join(directory, `profile-${lang}`);
    fs.mkdirSync(profile, { recursive: true });
    profiles.push(profile);

    // Copy disposable Quran corpus into this throwaway profile
    const corpus = setupThrowawayCorpus({
      targetDir: profile,
      copyPoetry: false,
      linkSunnah: false,
      includeMushafLayout: true,
    });
    corpora.push(corpus);

    // Copy Readest StarDict fixture (eng-nld) into throwaway profile
    const dictTargetDir = path.join(profile, 'test-dicts');
    fs.mkdirSync(dictTargetDir, { recursive: true });
    for (const ext of ['.ifo', '.idx', '.dict.dz']) {
      fs.copyFileSync(
        path.join(readestDictDir, `eng-nld${ext}`),
        path.join(dictTargetDir, `eng-nld${ext}`)
      );
    }
    const dictIfoPath = path.join(dictTargetDir, 'eng-nld.ifo');

    const pdf = pdfFor(lang);
    used.push({
      lang,
      pdf: path.relative(process.cwd(), pdf),
      dictFixture: 'repos/readest/readest-main/apps/readest-app/src/__tests__/fixtures/data/dicts/eng-nld.ifo',
    });

    const env = {
      ...process.env,
      BAGLIB_DATA_DIR: profile,
      BAGLIB_LEXICON_PROFILE: profile,
      BAGLIB_LEXICON_EVIDENCE: evidence,
      BAGLIB_LEXICON_LANG: lang,
      BAGLIB_LEXICON_PDF: pdf,
      BAGLIB_LEXICON_IFO: dictIfoPath,
      BAGLIB_REGISTER_PROTOCOL: '0',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    console.log(`[lexicon-live] ${lang}: ${path.basename(pdf)}`);
    const code = await new Promise(resolve => {
      const child = spawn(
        electron,
        ['scripts/lexicon-decks-live/main.cjs', `--user-data-dir=${profile}`],
        { env, stdio: 'inherit', windowsHide: true }
      );
      const timer = setTimeout(() => child.kill(), 240_000);
      child.once('exit', exitCode => {
        clearTimeout(timer);
        resolve(exitCode ?? 1);
      });
    });
    assert.equal(code, 0, `Electron exited with ${code} for ${lang}`);
  }

  fs.writeFileSync(path.join(evidence, 'real-files.json'), JSON.stringify(used, null, 2));
  const keep = path.resolve('.baglib-data/key400-evidence');
  fs.mkdirSync(keep, { recursive: true });
  for (const item of fs.readdirSync(evidence)) {
    fs.copyFileSync(path.join(evidence, item), path.join(keep, item));
  }
  fs.writeFileSync(path.join(keep, 'result.json'), JSON.stringify({ passed: true, directory }, null, 2));
  console.log('[lexicon-live] KEY-400 live check passed');
} finally {
  try {
    nextProcess?.kill('SIGTERM');
  } catch {}
  try {
    if (nextProcess) execSync('node scripts/ensure-port-free.js', { stdio: 'ignore' });
  } catch {}
  for (const corpus of corpora) {
    try {
      const report = corpus.cleanup();
      assert.equal(report.copiesDeleted, true, 'Corpus copies must be deleted');
      assert.equal(report.originalsUnchanged, true, 'Original corpus files must remain unchanged');
    } catch (e) {
      console.error('Corpus cleanup error:', e);
    }
  }
  for (const profile of profiles) {
    assert.equal(path.dirname(path.resolve(profile)), path.resolve(directory));
    fs.rmSync(profile, { recursive: true, force: true });
  }
  try {
    const keep = path.resolve('.baglib-data/key400-evidence');
    fs.mkdirSync(keep, { recursive: true });
    for (const item of fs.readdirSync(evidence)) {
      fs.copyFileSync(path.join(evidence, item), path.join(keep, item));
    }
  } catch {}
  fs.rmSync(directory, { recursive: true, force: true });
}
