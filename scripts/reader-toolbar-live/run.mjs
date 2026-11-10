import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import electron from 'electron';

const directory = fs.mkdtempSync(path.resolve('.baglib-data/key291-live-'));
const evidence = path.resolve('.baglib-data/KEY-291-evidence');
fs.mkdirSync(evidence, { recursive: true });
const manifest = JSON.parse(fs.readFileSync('tests/real-files/manifest.json', 'utf8'));
const entries = ['ar', 'en'].map(language => manifest.files.filter(file => file.kind === 'pdf' && file.lang === language && file.textLayer === 'yes').sort((a, b) => a.bytes - b.bytes)[0]);
entries.push(manifest.files.filter(file => file.kind === 'epub' && file.lang === 'en').sort((a, b) => a.bytes - b.bytes)[0]);
const hash = filename => createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const files = entries.map((entry, index) => ({ ...entry, filename: path.resolve('tests/real-files', entry.path), id: `key291-${index}`, title: `KEY291 ${entry.kind} ${entry.lang} Mixed` }));
for (const file of files) file.before = hash(file.filename);
fs.writeFileSync(path.join(directory, 'inputs.json'), JSON.stringify(files));
const env = { ...process.env, BAGLIB_DATA_DIR: directory, BAGLIB_KEY291_DIR: directory, BAGLIB_KEY291_EVIDENCE: evidence };
delete env.ELECTRON_RUN_AS_NODE;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', 'src/renderer', '-p', '3000', '-H', '127.0.0.1'], { stdio: ['ignore', fs.openSync(path.join(evidence, 'next.log'), 'a'), fs.openSync(path.join(evidence, 'next.err'), 'a')], windowsHide: true });
await new Promise(resolve => setTimeout(resolve, 1500));
if (server.exitCode !== null) throw new Error('Owned renderer failed to start');
for (let attempt = 0; attempt < 120; attempt++) {
  try { if ((await fetch('http://127.0.0.1:3000')).ok) break; } catch {}
  await new Promise(resolve => setTimeout(resolve, 500));
}
const child = spawn(electron, ['scripts/reader-toolbar-live/main.cjs', `--user-data-dir=${directory}`, '--disable-features=CalculateNativeWinOcclusion'], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 600000);
const code = await new Promise(resolve => child.once('exit', status => resolve(status ?? 1)));
clearTimeout(timer);
const { spawnSync } = await import('node:child_process');
spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
for (const file of files) if (hash(file.filename) !== file.before) throw new Error(`Real input changed ${file.filename}`);
fs.writeFileSync(path.join(evidence, 'inputs.json'), JSON.stringify({ directory, code, files, missingArabicEpub: true }, null, 2));
console.log(JSON.stringify({ directory, evidence, code }));
process.exitCode = code;
