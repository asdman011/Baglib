import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { PoetryProvisionStatus } from '../../../shared/types/poetry';
import { importPoetryPack } from './pack';

export class PoetryProvisioner {
  private child: ChildProcess | null = null;
  private packImport: AbortController | null = null;
  private status: PoetryProvisionStatus;
  constructor(private appPath: string, private userData: string, private parser = path.join(appPath, 'assets/poetry/parquet_rows.py'), private bundledManifest: string | null = null) {
    this.status = { phase: fs.existsSync(path.join(userData, 'partitions/bayan_poetry.sqlite')) ? 'ready' : 'idle', downloaded: 0, total: null, imported: 0 };
  }
  /** The pack shipped inside the installer, when its manifest and archive are both present. */
  private bundledPack(): string | null {
    if (!this.bundledManifest || !fs.existsSync(this.bundledManifest)) return null;
    try { const manifest = JSON.parse(fs.readFileSync(this.bundledManifest, 'utf8')) as { file?: unknown }; return typeof manifest.file === 'string' && fs.existsSync(path.join(path.dirname(this.bundledManifest), manifest.file)) ? this.bundledManifest : null; } catch { return null; }
  }
  getStatus(): PoetryProvisionStatus { return this.bundledPack() ? { ...this.status, bundled: true } : { ...this.status }; }
  /** Installed builds: unpack the verified pack the installer shipped, with the same checks as a picked pack. */
  importBundled(): PoetryProvisionStatus {
    const manifest = this.bundledPack();
    if (!manifest) { if (this.status.phase !== 'ready' && !this.child && !this.packImport) this.status = { ...this.status, phase: 'error', error: 'pack' }; return this.getStatus(); }
    return this.importPack(manifest);
  }
  start(): PoetryProvisionStatus {
    if (this.child || this.packImport || this.status.phase === 'ready') return this.getStatus();
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
  /**
   * KEY-266: import a local prebuilt pack. The SHA-256 in the manifest already proves the bytes match a known-good
   * database, so verification only opens it read-only and counts poems.
   */
  importPack(manifestPath: string): PoetryProvisionStatus {
    if (this.child || this.packImport || this.status.phase === 'ready') return this.getStatus();
    const controller = new AbortController();
    this.packImport = controller;
    this.status = { phase: 'unpacking', downloaded: 0, total: null, imported: 0 };
    void importPoetryPack({
      manifestPath, userData: this.userData, signal: controller.signal,
      progress: (written, total) => { if (this.packImport === controller) { this.status.downloaded = written; this.status.total = total; } },
      freeBytes: async directory => { const info = await fs.promises.statfs(directory); return Number(info.bavail) * Number(info.bsize); },
      verify: async staged => { const database = new Database(staged, { readonly: true, fileMustExist: true }); try { return Number((database.prepare('SELECT count(*) AS n FROM poems').get() as { n: number }).n); } finally { database.close(); } },
    }).then(() => {
      if (this.packImport !== controller) return;
      this.status = { ...this.status, phase: 'ready', error: undefined };
    }, (error: unknown) => {
      if (this.packImport !== controller) return;
      const code = error instanceof Error ? error.message : '';
      this.status.phase = code === 'poetry-partition-exists' ? 'ready' : code === 'cancelled' ? 'idle' : 'error';
      this.status.error = code === 'cancelled' ? 'cancelled' : code === 'poetry-pack-no-space' ? 'space' : code === 'poetry-pack-checksum-mismatch' || code === 'poetry-invalid-partition' ? 'integrity' : code === 'poetry-partition-exists' ? undefined : 'pack';
    }).finally(() => { if (this.packImport === controller) this.packImport = null; });
    return this.getStatus();
  }
  cancelImport(): PoetryProvisionStatus {
    this.packImport?.abort();
    return this.getStatus();
  }
  close(): void {
    this.packImport?.abort();
    const child = this.child; this.child = null;
    if (child?.pid) {
      if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
    }
    if (this.status.phase === 'downloading' || this.status.phase === 'importing') this.status.phase = 'idle';
  }
}
