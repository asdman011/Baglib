import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';

const existingApps = () =>
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"name='electron.exe' or name='Baglib.exe'\" | Where-Object { $_.CommandLine -like '*.baglib-data*' } | Select-Object -ExpandProperty ProcessId; exit 0",
    ],
    { encoding: 'utf8', windowsHide: true }
  ).trim();

for (let attempt = 0; existingApps() && attempt < 60; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.equal(existingApps(), '', 'another live run must never overlap this one (an open user app is left alone)');

const data = path.resolve('.baglib-data');
const profile = fs.mkdtempSync(path.join(data, 'KEY-379-live-'));
const evidence = path.join(data, 'KEY-379-evidence');
fs.mkdirSync(evidence, { recursive: true });
fs.rmSync(path.join(evidence, 'results.json'), { force: true });

const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const inputs = [];
let renderer;

try {
  // Use real Arabic and English PDFs per overnight rules
  for (const lang of ['ar', 'en']) {
    const source = manifest.files.find((file) => file.kind === 'pdf' && file.lang === lang && file.textLayer === 'yes');
    assert.ok(source, `Missing real test PDF for ${lang}`);
    const copy = path.join(profile, `input-pdf-${lang}.pdf`);
    fs.copyFileSync(path.resolve('tests/real-files', source.path), copy);
    inputs.push({
      ...source,
      copy,
      baseline: createHash('sha256').update(fs.readFileSync(path.resolve('tests/real-files', source.path))).digest('hex'),
    });
  }

  fs.writeFileSync(path.join(profile, 'inputs.json'), JSON.stringify(inputs));
  fs.writeFileSync(
    path.join(evidence, 'real-file-baselines.json'),
    JSON.stringify(inputs.map(({ path: file, sha256: manifestHash, baseline }) => ({ file, manifestHash, baseline })), null, 2)
  );

  // Check / start renderer
  if (!await rendererAnswers()) {
    console.log('[live] Starting Next.js renderer on localhost:3000...');
    renderer = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', 'localhost'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    for (let attempt = 0; attempt < 60 && !await rendererAnswers(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(await rendererAnswers(), 'renderer must answer on port 3000');
  }

  assert.equal(existingApps(), '', 'exclusive native slot required');

  const env = {
    ...process.env,
    BAGLIB_DATA_DIR: profile,
    BAGLIB_KEY379_PROFILE: profile,
    BAGLIB_KEY379_EVIDENCE: evidence,
    BAGLIB_REGISTER_PROTOCOL: '0',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  console.log('[live] Launching Electron nav collapse live check...');
  const code = await new Promise((resolve) => {
    const child = spawn(electron, ['scripts/nav-collapse-live/main.cjs', '--user-data-dir=' + profile], {
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    const timer = setTimeout(() => child.kill(), 180000);
    child.once('exit', (c) => {
      clearTimeout(timer);
      resolve(c ?? 1);
    });
  });

  assert.equal(code, 0, 'Electron nav collapse live check failed');
  console.log('[live] Live check passed successfully!');
} finally {
  for (const input of inputs) {
    const currentHash = createHash('sha256').update(fs.readFileSync(path.resolve('tests/real-files', input.path))).digest('hex');
    assert.equal(currentHash, input.baseline, 'real original unchanged from pre-run baseline');
  }

  if (renderer?.pid) {
    try {
      execFileSync('taskkill', ['/pid', String(renderer.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } catch {}
  }

  assert.equal(path.dirname(path.resolve(profile)), data);
  assert.ok(path.basename(profile).startsWith('KEY-379-live-'));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ profileDeleted: !fs.existsSync(profile), originalsUnchanged: true }));
}
