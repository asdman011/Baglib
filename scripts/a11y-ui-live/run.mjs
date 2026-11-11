import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';
import electron from 'electron';

const root = fs.realpathSync('.baglib-data');
const profile = fs.mkdtempSync(path.join(root, 'k298-'));
const evidence = path.join(root, 'KEY-298-evidence', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const files = ['ar', 'en'].map((lang, index) => {
  const entry = manifest.files.filter(file => file.kind === 'pdf' && file.lang === lang && file.textLayer === 'yes').sort((a, b) => a.bytes - b.bytes)[0];
  const filename = path.resolve('tests/real-files', entry.path);
  return { ...entry, filename, id: `key298-${index}`, title: `KEY298 ${lang} \u0639\u0650\u0644\u0652\u0645 Knowledge`, before: hash(filename) };
});
fs.writeFileSync(path.join(profile, 'inputs.json'), JSON.stringify(files));
const env = { ...process.env, BAGLIB_DATA_DIR: profile, BAGLIB_KEY298_DIR: profile, BAGLIB_KEY298_EVIDENCE: evidence };
delete env.ELECTRON_RUN_AS_NODE;
let server;
let code = 1;
try {
  buildSync({ entryPoints: ['scripts/a11y-ui-live/fixture.tsx'], outfile: path.join(profile, 'fixture.js'), bundle: true, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' } });
  let ready = false;
  try { ready = (await fetch('http://127.0.0.1:3000')).ok; } catch {}
  if (!ready) {
    const log = fs.openSync(path.join(evidence, 'next.log'), 'a');
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: ['ignore', log, log], windowsHide: true });
    for (let attempt = 0; attempt < 180; attempt++) {
      try { if ((await fetch('http://127.0.0.1:3000')).ok) { ready = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error('Owned renderer failed to start');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  if (!ready) throw new Error('Renderer unavailable');
  code = await new Promise((resolve, reject) => {
    const log = fs.openSync(path.join(evidence, 'electron.log'), 'a');
    const child = spawn(electron, ['scripts/a11y-ui-live/main.cjs', `--user-data-dir=${profile}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: ['ignore', log, log], windowsHide: true });
    const timer = setTimeout(() => child.kill(), 2700000);
    child.once('error', reject);
    child.once('exit', status => { clearTimeout(timer); resolve(status ?? 1); });
  });
} finally {
  if (server) spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  for (const file of files) if (hash(file.filename) !== file.before) { code = 1; throw new Error('Original file changed ' + file.filename); }
  const target = fs.realpathSync(profile);
  if (!target.startsWith(root + path.sep) || !path.basename(target).startsWith('k298-')) throw new Error('Unsafe cleanup target');
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
  fs.writeFileSync(path.join(evidence, 'cleanup.json'), JSON.stringify({ profile, removed: !fs.existsSync(profile), originalsUnchanged: true, code }, null, 2));
}
console.log(JSON.stringify({ evidence, code }));
process.exitCode = code;
