import { app, type BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const active = new Map<number, ChildProcess>();

export function shareHadith(window: BrowserWindow, text: string): Promise<void> {
  if (process.platform !== 'win32' || typeof text !== 'string' || !text.trim() || Buffer.byteLength(text, 'utf8') > 256_000) {
    return Promise.reject(new Error('Native sharing unavailable or invalid payload'));
  }
  active.get(window.id)?.kill();
  const script = app.isPackaged ? path.join(process.resourcesPath, 'native-share.ps1') : path.join(app.getAppPath(), 'assets', 'native-share.ps1');
  const command = Buffer.from(readFileSync(script, 'utf8'), 'utf16le').toString('base64');
  const child = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  active.set(window.id, child);
  const stop = () => child.kill();
  window.once('closed', stop);
  app.once('before-quit', stop);
  const lifetime = setTimeout(stop, 125_000);
  child.once('close', () => {
    clearTimeout(lifetime);
    window.removeListener('closed', stop);
    app.removeListener('before-quit', stop);
    if (active.get(window.id) === child) active.delete(window.id);
  });
  return new Promise((resolve, reject) => {
    let ready = false;
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error(`Native sharing timed out: ${stdout} ${stderr}`)); }, 20_000);
    child.stdout.on('data', data => {
      stdout = (stdout + data.toString()).slice(-1024);
      if (!ready && stdout.includes('READY')) { ready = true; clearTimeout(timeout); resolve(); }
    });
    child.stderr.on('data', data => { stderr = (stderr + data.toString()).slice(-4096); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.stdin.on('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', () => { clearTimeout(timeout); if (!ready) reject(new Error(stderr || 'Native sharing closed before opening')); });
    child.stdin.end(JSON.stringify({ text: Buffer.from(text, 'utf8').toString('base64') }));
  });
}
