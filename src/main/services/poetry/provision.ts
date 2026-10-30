import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { PoetryProvisionStatus } from '../../../shared/types/poetry';

export class PoetryProvisioner {
  private child: ChildProcess | null = null;
  private status: PoetryProvisionStatus;
  constructor(private appPath: string, private userData: string, private parser = path.join(appPath, 'assets/poetry/parquet_rows.py')) {
    this.status = { phase: fs.existsSync(path.join(userData, 'partitions/bayan_poetry.sqlite')) ? 'ready' : 'idle', downloaded: 0, total: null, imported: 0 };
  }
  getStatus(): PoetryProvisionStatus { return { ...this.status }; }
  start(): PoetryProvisionStatus {
    if (this.child || this.status.phase === 'ready') return this.getStatus();
    const script = path.join(this.appPath, 'dist/main/poetry-provision-worker.js');
    if (!fs.existsSync(script)) { this.status.phase = 'error'; return this.getStatus(); }
    this.status = { phase: 'downloading', downloaded: 0, total: null, imported: 0 };
    const developmentPython = path.join(this.appPath, 'tools/hadith-alignment/.venv/Scripts/python.exe');
    const python = process.env.BAGLIB_POETRY_PYTHON || (fs.existsSync(developmentPython) ? developmentPython : process.platform === 'win32' ? 'python' : 'python3');
    const child = spawn(process.execPath, [script], { cwd: this.userData, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', BAGLIB_POETRY_USER_DATA: this.userData, BAGLIB_POETRY_PYTHON: python, BAGLIB_POETRY_PARSER: this.parser } });
    this.child = child;
    let buffer = '';
    child.stderr?.resume();
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (this.child !== child) return;
      buffer += chunk;
      if (buffer.length > 1024 * 1024) { this.close(); this.status.phase = 'error'; return; }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.error) this.status.error = message.error === 'poetry-python-unavailable' ? 'python' : message.error === 'poetry-shard-checksum-mismatch' ? 'integrity' : 'failed';
          if (Number.isFinite(message.downloaded) && message.downloaded >= 0) { this.status.phase = 'downloading'; this.status.downloaded = message.downloaded; this.status.total = Number.isFinite(message.total) && message.total > 0 ? message.total : null; }
          if (Number.isSafeInteger(message.imported) && message.imported >= 0) { this.status.phase = 'importing'; this.status.imported = message.imported; }
        } catch {}
      }
    });
    child.once('error', () => { if (this.child === child) { this.status.phase = 'error'; this.child = null; } });
    child.once('close', code => {
      if (this.child !== child) return;
      this.child = null;
      this.status.phase = code === 0 && fs.existsSync(path.join(this.userData, 'partitions/bayan_poetry.sqlite')) ? 'ready' : 'error';
    });
    return this.getStatus();
  }
  close(): void {
    const child = this.child; this.child = null;
    if (child?.pid) {
      if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
    }
    if (this.status.phase === 'downloading' || this.status.phase === 'importing') this.status.phase = 'idle';
  }
}
