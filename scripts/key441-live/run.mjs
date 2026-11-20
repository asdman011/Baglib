import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import electron from 'electron';
import { build } from 'esbuild';

import next from 'next';
import http from 'node:http';
import { rendererAnswers } from '../lib/renderer.mjs';
// Reuse another agent's renderer or own Next in this foreground runner.
const overall = setTimeout(() => { console.error('KEY-441 runner hard timeout'); process.exit(1); }, 240000);
let renderer;
const contentTypes = { '.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css', '.json':'application/json', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.png':'image/png', '.wasm':'application/wasm' };
const publicRoot=path.resolve('out');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const target=path.resolve(publicRoot,'.'+(pathname==='/'?'/index.html':pathname));
 if(!target.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end();return;}
 try{res.writeHead(200,{'Content-Type':contentTypes[path.extname(target)]||'application/octet-stream'});res.end(fs.readFileSync(target));}
 catch{res.writeHead(404);res.end();}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3441,'127.0.0.1',resolve)});
const root = fs.realpathSync('.baglib-data');
const evidence = path.join(root, 'key441-evidence');
fs.mkdirSync(evidence, { recursive: true });
for (const name of ['failure.txt','failure.png','result.json']) fs.rmSync(path.join(evidence,name),{force:true});
const profile = fs.mkdtempSync(path.join(root, 'k441-'));
const env = { ...process.env, BAGLIB_KEY441_PROFILE: profile, BAGLIB_KEY441_EVIDENCE: evidence, BAGLIB_REGISTER_PROTOCOL: '0', BAGLIB_DEV_URL: 'http://127.0.0.1:3441' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.BAGLIB_LIVE_VISIBLE;
await build({entryPoints:['src/renderer/translations.ts'],outfile:path.join(profile,'labels.cjs'),bundle:true,platform:'node',format:'cjs'});
let exitCode = 0;
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(electron, ['scripts/key441-live/main.cjs', '--user-data-dir=' + profile], { env, stdio: 'inherit', windowsHide: true });
    const timer = setTimeout(() => child.kill(), 210000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(code, 0, 'KEY-441 live check failed');
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  const target = fs.realpathSync(profile);
  assert.equal(path.dirname(target), root);
  assert.ok(path.basename(target).startsWith('k441-'));
  fs.rmSync(target, { recursive: true, force: true });
  console.log('KEY-441 throwaway profile deleted');
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await renderer?.close();
  clearTimeout(overall);
}

process.exit(exitCode);
