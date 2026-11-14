import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import electron from 'electron';
import { build } from 'esbuild';
const root = fs.realpathSync('.baglib-data');
const profile = fs.mkdtempSync(path.join(root, 'k363-'));
const evidence = path.join(root, 'KEY-363-evidence');
fs.mkdirSync(evidence, { recursive: true });
const originalDist = path.resolve('research-editor/dist');
const hiddenDist = path.resolve('research-editor/dist.KEY-363-hidden');
const existing = () => execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Process electron,Baglib -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id; exit 0'], { encoding: 'utf8', windowsHide: true }).trim();
let server;
try {
  await build({ entryPoints: ['scripts/research-editor-host-live/initialize.ts'], outfile: path.join(profile,'initialize.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external' });
  while (existing()) { console.log('KEY-363 waiting for other Electron processes'); await new Promise(resolve => setTimeout(resolve, 30000)); }
  // Serve the actual exported Next UI at the development origin. Electron supplies editor assets.
  const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost:3000').pathname);
    const target = path.resolve('out', '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(path.resolve('out') + path.sep)) { response.writeHead(404).end(); return; }
    fs.readFile(target, (error, bytes) => { if (error) response.writeHead(404).end(); else { response.setHeader('content-type', mime[path.extname(target)] || 'application/octet-stream'); response.end(bytes); } });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3000, '127.0.0.1', resolve); });
  const counts = [];
  for (const phase of ['initial', 'restart', 'development', 'missing']) {
    while (existing()) { console.log('KEY-363 waiting for other Electron processes'); await new Promise(resolve => setTimeout(resolve, 30000)); }
    if (phase === 'missing') { assert.ok(!fs.existsSync(hiddenDist)); fs.renameSync(originalDist, hiddenDist); }
    try {
      const env = { ...process.env, BAGLIB_KEY363_PROFILE: profile, BAGLIB_KEY363_EVIDENCE: evidence, BAGLIB_KEY363_PHASE: phase, BAGLIB_KEY363_REA_WAIT_MS: process.env.BAGLIB_KEY363_REA_WAIT_MS || '0', BAGLIB_DEV_URL: phase === 'development' ? 'http://localhost:3000' : 'app://-/', BAGLIB_REGISTER_PROTOCOL: '0' };
      delete env.ELECTRON_RUN_AS_NODE;
      const code = await new Promise((resolve, reject) => {
        const child = spawn(electron, ['scripts/research-editor-host-live/main.cjs', '--user-data-dir=' + profile], { env, stdio: 'inherit', windowsHide: true });
        const timer = setTimeout(() => { console.error('KEY-363 owned live process timeout'); child.kill(); }, 240000);
        child.once('error', reject); child.once('exit', value => { clearTimeout(timer); resolve(value); });
      });
      assert.equal(code, 0, 'live phase ' + phase); counts.push(phase);
    } finally { if (phase === 'missing' && fs.existsSync(hiddenDist)) fs.renameSync(hiddenDist, originalDist); }
  }
  fs.writeFileSync(path.join(evidence, 'summary.json'), JSON.stringify({ pass: counts.length, fail: 0, phases: counts }, null, 2));
  console.log('KEY-363 native ' + counts.length + '/4 pass');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  const target = fs.realpathSync(profile); assert.equal(path.dirname(target), root); assert.ok(path.basename(target).startsWith('k363-'));
  fs.rmSync(target, { recursive: true, force: true });
  console.log('KEY-363 throwaway profile deleted');
}
