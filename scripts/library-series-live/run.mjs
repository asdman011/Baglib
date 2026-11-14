import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { createHash } from 'node:crypto';
import { rendererAnswers } from '../lib/renderer.mjs';

const existingApps = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0'], { encoding: 'utf8', windowsHide: true }).trim();
const waitForSlot = async () => {
  while (existingApps()) {
    console.log('KEY-348 waiting for existing Electron/Baglib processes');
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
};
await waitForSlot();
const data = path.resolve('.baglib-data');
const profile = fs.mkdtempSync(path.join(data, 'KEY-348-live-'));
const evidence = path.join(data, 'KEY-348-evidence');
fs.mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const inputs = {};
for (const lang of ['ar', 'en']) {
  const source = manifest.files.find(file => file.kind === 'video' && file.lang === lang);
  assert.ok(source, 'real lecture video for ' + lang);
  const folder = path.join(profile, 'imports', lang + ' Course');
  fs.mkdirSync(folder, { recursive: true });
  for (const number of [10, 2]) fs.copyFileSync(path.resolve('tests/real-files', source.path), path.join(folder, number + '.mp4'));
  inputs[lang] = { folder, source: source.path, sha256: source.sha256 };
}
const single = path.join(profile, 'imports', 'single.mp4');
fs.copyFileSync(path.resolve('tests/real-files', inputs.en.source), single);
fs.writeFileSync(path.join(profile, 'inputs.json'), JSON.stringify({ ...inputs, single }));
let renderer;
try {
  if (!await rendererAnswers()) {
    renderer = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', 'localhost'], { stdio: 'ignore', windowsHide: true });
    for (let attempt = 0; attempt < 60 && !await rendererAnswers(); attempt++) await new Promise(resolve => setTimeout(resolve, 1000));
    assert.ok(await rendererAnswers(), 'renderer ready');
  }
  await waitForSlot();
  const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_KEY348_PROFILE: profile, BAGLIB_KEY348_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0' };
  delete env.ELECTRON_RUN_AS_NODE;
  const code = await new Promise(resolve => {
    const child = spawn(electron, ['scripts/library-series-live/main.cjs', '--user-data-dir=' + profile, '--autoplay-policy=no-user-gesture-required'], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 240000);
    child.once('exit', code => { clearTimeout(timer); resolve(code ?? 1); });
  });
  assert.equal(code, 0, 'native library checks');
} finally {
  for (const lang of ['ar', 'en']) {
    const original = path.resolve('tests/real-files', inputs[lang].source);
    assert.equal(createHash('sha256').update(fs.readFileSync(original)).digest('hex'), inputs[lang].sha256, 'original unchanged');
  }
  if (renderer?.pid) {
    try { execFileSync('taskkill', ['/pid', String(renderer.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); } catch { /* owned renderer already exited */ }
  }
  assert.equal(path.dirname(path.resolve(profile)), data);
  assert.ok(path.basename(profile).startsWith('KEY-348-live-'));
  fs.rmSync(profile, { recursive: true, force: true });
  console.log(JSON.stringify({ profileDeleted: !fs.existsSync(profile) }));
}
