import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import electron from 'electron';

const root = fs.realpathSync('.baglib-data');
const evidence = path.join(root, 'KEY-373-evidence');
fs.mkdirSync(evidence, { recursive: true });

for (const name of ['failure.txt', 'failure.png', 'result.json']) {
  fs.rmSync(path.join(evidence, name), { force: true });
}

const profile = fs.mkdtempSync(path.join(root, 'k373-'));
const existing = () => execFileSync(
  'powershell.exe',
  ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"name='electron.exe' or name='Baglib.exe'\" | Where-Object { $_.CommandLine -like '*.baglib-data*' } | Select-Object -ExpandProperty ProcessId; exit 0"],
  { encoding: 'utf8', windowsHide: true }
).trim();

try {
  await build({
    entryPoints: ['scripts/research-ai-live/initialize.ts'],
    outfile: path.join(profile, 'initialize.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
  });

  fs.mkdirSync(path.join(profile, 'partitions'), { recursive: true });
  const installed = path.join(process.env.APPDATA, 'baglib', 'partitions', 'bayan_poetry.sqlite');
  if (fs.existsSync(installed)) {
    fs.copyFileSync(installed, path.join(profile, 'partitions', 'bayan_poetry.sqlite'));
  }

  while (existing()) {
    console.log('KEY-373 waiting for other Electron processes to finish...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  const env = {
    ...process.env,
    BAGLIB_KEY373_PROFILE: profile,
    BAGLIB_KEY373_EVIDENCE: evidence,
    BAGLIB_REGISTER_PROTOCOL: '0',
    BAGLIB_DEV_URL: 'app://-/',
  };
  delete env.ELECTRON_RUN_AS_NODE;

  console.log('Starting KEY-373 live scenario in Electron...');
  const code = await new Promise((resolve, reject) => {
    const child = spawn(
      electron,
      ['scripts/research-ai-live/main.cjs', '--user-data-dir=' + profile],
      { env, stdio: 'inherit', windowsHide: true }
    );
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('timeout'));
    }, 180000);
    child.on('exit', c => {
      clearTimeout(timer);
      resolve(c);
    });
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });

  assert.equal(code, 0, 'exit code');
  assert.ok(fs.existsSync(path.join(evidence, 'result.json')), 'result.json written');
  console.log('KEY-373 run passed cleanly, exit code 0');
} finally {
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {}
}
