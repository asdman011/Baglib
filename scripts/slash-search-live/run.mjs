import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import electron from 'electron';
import { rendererAnswers } from '../lib/renderer.mjs';
const existingApps = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"name='electron.exe' or name='Baglib.exe'\" | Where-Object { $_.CommandLine -like '*.baglib-data*' } | Select-Object -ExpandProperty ProcessId; exit 0"], { encoding: 'utf8', windowsHide: true }).trim();
for (let attempt = 0; existingApps() && attempt < 60; attempt++) await new Promise(resolve => setTimeout(resolve, 1000));
assert.equal(existingApps(), '', 'another live run must never overlap this one (an open user app is left alone)');
const data = path.resolve('.baglib-data');
const profile = fs.mkdtempSync(path.join(data, 'KEY-350-live-'));
const evidence = path.join(data, 'KEY-350-evidence');
fs.mkdirSync(evidence, { recursive: true });
fs.rmSync(path.join(evidence, 'results.json'), { force: true });
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const inputs = [];
let renderer;
try {
  for (const kind of ['pdf', 'video']) for (const lang of ['ar', 'en']) {
    const source = manifest.files.find(file => file.kind === kind && file.lang === lang && (kind !== 'pdf' || file.textLayer === 'yes'));
    assert.ok(source);
    const copy = path.join(profile, `input-${kind}-${lang}.${kind === 'pdf' ? 'pdf' : 'mp4'}`);
    fs.copyFileSync(path.resolve('tests/real-files', source.path), copy);
    inputs.push({ ...source, copy, baseline: createHash('sha256').update(fs.readFileSync(path.resolve('tests/real-files', source.path))).digest('hex') });
  }
  const scan = manifest.files.find(file => file.textLayer === 'no');
  const scanCopy = path.join(profile, 'scan-ar.pdf'); fs.copyFileSync(path.resolve('tests/real-files', scan.path), scanCopy);
  inputs.push({ ...scan, copy: scanCopy, baseline: createHash('sha256').update(fs.readFileSync(path.resolve('tests/real-files', scan.path))).digest('hex') });
  const video = inputs.find(input => input.kind === 'video' && input.lang === 'ar');
  fs.writeFileSync(video.copy.replace(/\.mp4$/u, '.srt'), '1\n00:00:12,000 --> 00:00:14,000\nLearning a whole\n\n2\n00:00:14,000 --> 00:00:18,000\nsentence together.\n');
  fs.writeFileSync(path.join(profile, 'inputs.json'), JSON.stringify(inputs));
  fs.writeFileSync(path.join(evidence, 'real-file-baselines.json'), JSON.stringify(inputs.map(({ path: file, sha256: manifestHash, baseline }) => ({ file, manifestHash, baseline })), null, 2));
  // Use only the already supplied local pack. No network or download is needed.
  fs.mkdirSync(path.join(profile, 'partitions'), { recursive: true });
  await pipeline(fs.createReadStream('release/win-unpacked/resources/poetry-pack/bayan_poetry-v1.sqlite.gz'), createGunzip(), fs.createWriteStream(path.join(profile, 'partitions/bayan_poetry.sqlite')));
  if (!await rendererAnswers()) {
    renderer = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', 'localhost'], { stdio: 'ignore', windowsHide: true });
    for (let attempt = 0; attempt < 60 && !await rendererAnswers(); attempt++) await new Promise(resolve => setTimeout(resolve, 1000));
    assert.ok(await rendererAnswers(), 'renderer ready');
  }
  assert.equal(existingApps(), '', 'exclusive native slot');
  const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_KEY350_PROFILE: profile, BAGLIB_KEY350_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise(resolve => {
    const child = spawn(electron, ['scripts/slash-search-live/main.cjs', '--user-data-dir=' + profile], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 360000);
    child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
  });
  assert.equal(code, 0, 'native slash checks');
} finally {
  for (const input of inputs) assert.equal(createHash('sha256').update(fs.readFileSync(path.resolve('tests/real-files', input.path))).digest('hex'), input.baseline, 'real original unchanged from pre-run baseline');
  if (renderer?.pid) try { execFileSync('taskkill', ['/pid', String(renderer.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* owned renderer already stopped */ }
  assert.equal(path.dirname(path.resolve(profile)), data);
  assert.ok(path.basename(profile).startsWith('KEY-350-live-'));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ profileDeleted: !fs.existsSync(profile), originalsUnchanged: true }));
}
