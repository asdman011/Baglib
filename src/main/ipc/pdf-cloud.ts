import { app, ipcMain, safeStorage, shell, type IpcMainInvokeEvent } from 'electron';
import { mkdir, writeFile, unlink, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getDatabase } from '../database/connection';
import { settingsRepository } from '../database/repositories/settings.repository';
import { SqliteWorkRepository } from '../database/repositories/work.repository';
import { CloudVault } from '../services/pdf-editor/cloud-vault';
import { CloudDrive } from '../services/pdf-editor/cloud-drive';
import { PdfCloudConnector } from '../services/pdf-editor/cloud-connector';
import { resolvePdfSource } from '../services/pdf-editor/source';
import type { PdfEditorJobs } from '../services/pdf-editor/jobs';
import { cloudProvider, type PdfCloudError, type PdfCloudResult } from '../../shared/types/pdf-cloud';
import { inspectPdfFile } from '../services/pdf-editor/inspection';

export function registerPdfCloudIpc(jobs: () => PdfEditorJobs, owner: (event: IpcMainInvokeEvent) => number): void {
  let connector: PdfCloudConnector | undefined;
  const controller = () => {
    if (connector) return connector;
    const vault = new CloudVault(settingsRepository, safeStorage);
    connector = new PdfCloudConnector(vault, new CloudDrive(vault), settingsRepository, {
      source: (sourceId, workId) => resolvePdfSource(getDatabase(), workId, sourceId),
      import: async (bytes, name, existingWorkId) => {
        const directory = path.join(app.getPath('userData'), 'pdf-editor', 'cloud-imports');
        await mkdir(directory, { recursive: true });
        const filename = path.join(directory, `${randomUUID()}.pdf`), workId = existingWorkId || randomUUID();
        const hash = createHash('sha256').update(bytes).digest('hex');
        await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 });
        try {
          // Validate with the real parser before creating canonical records.
          await inspectPdfFile(filename, undefined, () => {});
          const db = getDatabase(), repository = new SqliteWorkRepository(db);
          const row = db.transaction(() => {
            if (existingWorkId) { if (!repository.addEditionToWork(workId, { filePath: filename, fileHash: hash, digitalFormat: 'PDF' })) throw new Error('invalid-request'); }
            else repository.addBook({ id: workId, title: name.replace(/\.pdf$/iu, ''), author: '', workType: 'book', bookType: 'digital', filePath: filename, digitalFormat: 'PDF' });
            const row = db.prepare('SELECT source_id id FROM file_source_detail WHERE file_path=?').get(filename) as { id: string };
            db.prepare('UPDATE file_source_detail SET file_hash=?,file_size_bytes=?,is_managed=1 WHERE source_id=?').run(hash, bytes.length, row.id);
            return row;
          })();
          return resolvePdfSource(db, workId, row.id);
        } catch (error) { await unlink(filename).catch(() => {}); throw error; }
      },
    }, url => shell.openExternal(url));
    connector.start(); app.once('before-quit', () => connector?.stop()); return connector;
  };
  const invoke = async <T>(event: IpcMainInvokeEvent, action: (id: number) => Promise<T> | T): Promise<PdfCloudResult<T>> => {
    try { return { ok: true, data: await action(owner(event)) }; }
    catch (error) {
      const code = (error as Error).message;
      return { ok: false, error: (['invalid-request', 'not-configured', 'not-connected', 'secure-storage-unavailable', 'login-failed', 'login-cancelled', 'login-timeout', 'permission-denied', 'conflict', 'too-large', 'invalid-pdf', 'source-changed', 'storage'].includes(code) ? code : 'network') as PdfCloudError };
    }
  };
  ipcMain.handle('pdf-cloud:status', (event, provider) => invoke(event, () => controller().status(cloudProvider(provider))));
  ipcMain.handle('pdf-cloud:configure', (event, provider, config) => invoke(event, () => controller().configure(cloudProvider(provider), config)));
  ipcMain.handle('pdf-cloud:connect', (event, provider, language) => invoke(event, () => controller().connect(cloudProvider(provider), language)));
  ipcMain.handle('pdf-cloud:cancel-login', (event, provider) => invoke(event, () => { controller().cancel(cloudProvider(provider)); return null; }));
  ipcMain.handle('pdf-cloud:disconnect', (event, provider) => invoke(event, () => { controller().disconnect(cloudProvider(provider)); return null; }));
  ipcMain.handle('pdf-cloud:list', (event, provider, folder, next) => invoke(event, () => controller().drive.list(cloudProvider(provider), folder, next)));
  ipcMain.handle('pdf-cloud:import', (event, provider, remoteId, workId) => invoke(event, async id => { const source = await controller().import(cloudProvider(provider), remoteId, workId); return { workId: source.workId!, session: await jobs().open(id, source.workId!, source.sourceId!) }; }));
  ipcMain.handle('pdf-cloud:export', (event, provider, sessionId, folder, name) => invoke(event, id => controller().export(cloudProvider(provider), jobs().source(id, sessionId), folder, name)));
  ipcMain.handle('pdf-cloud:export-output', (event, provider, jobId, index, folder, name) => invoke(event, async id => {
    const output = await jobs().output(id, jobId, index);
    if (typeof name !== 'string' || path.extname(name).toLowerCase() !== `.${output.format}` || !['pdf', 'docx', 'xlsx', 'pptx', 'html'].includes(output.format)) throw new Error('invalid-request');
    if ((await stat(output.filename)).size > 256 * 1024 * 1024) throw new Error('too-large');
    const bytes = await readFile(output.filename);
    if (createHash('sha256').update(bytes).digest('hex') !== output.sha256) throw new Error('source-changed');
    return controller().drive.upload(cloudProvider(provider), bytes, folder, name);
  }));
  ipcMain.handle('pdf-cloud:links', event => invoke(event, () => controller().links()));
  ipcMain.handle('pdf-cloud:link', (event, provider, sessionId, remoteId) => invoke(event, id => controller().link(cloudProvider(provider), jobs().source(id, sessionId), remoteId)));
  ipcMain.handle('pdf-cloud:set-sync', (event, id, enabled) => invoke(event, () => { controller().setSync(id, enabled); return null; }));
  ipcMain.handle('pdf-cloud:unlink', (event, id) => invoke(event, () => { controller().unlink(id); return null; }));
  ipcMain.handle('pdf-cloud:sync', (event, id) => invoke(event, () => controller().sync(id)));
}
