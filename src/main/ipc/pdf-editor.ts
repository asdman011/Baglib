import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import { mkdir, writeFile, unlink, stat, readdir, copyFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readerAssetUrl } from '../../shared/utils/reader-asset-url';
import { getDatabase } from '../database/connection';
import { PdfEditorJobs } from '../services/pdf-editor/jobs';
import { runPdfWorker } from '../services/pdf-editor/process';
import { publishPdfOutput } from '../services/pdf-editor/publication';
import { fileSha256 } from '../services/pdf-editor/source';
import { pdfCapabilities, type PdfError, type PdfResult, type PdfVersionItem } from '../../shared/types/pdf-editor';
import { registerPdfCloudIpc } from './pdf-cloud';
import { registerPdfCollaborationIpc } from './pdf-collaboration';
import { pdfEngineTools } from '../services/pdf-editor/tools';
import { PdfViewCache } from '../services/pdf-editor/view-cache';
import { pdfViewOptimizer } from '../services/pdf-editor/view-cache-runtime';
import { stirlingInspection, type PdfEngineTools } from '../services/pdf-editor/python';
import { runStirlingPdf, defaultStirlingSidecar } from '../services/pdf-editor/stirling';
import { SqliteWorkRepository } from '../database/repositories/work.repository';
import type { PdfSaveRequest } from '../../shared/types/pdf-editor';
import { PdfAudit } from '../services/pdf-editor/audit';
import { settingsRepository } from '../database/repositories/settings.repository';
import {
  stirlingProcessor,
  type StirlingPipeline,
  type StirlingGovernancePolicies,
  type WatchedFolderSource,
  exportPipelineAutomateJson,
  exportPipelineFolderScanJson,
  importPipelineJson,
} from '../services/pdf-editor/processor';

function isStirlingConfigured(tools: PdfEngineTools): boolean {
  return Boolean(tools.stirlingUrl || (tools.java && tools.stirlingJar && fs.existsSync(tools.java) && fs.existsSync(tools.stirlingJar)));
}

let lifecycleHooksRegistered = false;
const viewCaches = new Set<PdfViewCache>();
export async function shutdownPdfViewCaches(): Promise<void> {
  await Promise.allSettled([...viewCaches].map(cache => cache.dispose()));
  viewCaches.clear();
}

export function registerPdfEditorIpc(options: { viewCacheDirectory?: string } = {}): void {
  let jobs: PdfEditorJobs | undefined;
  const owners = new Set<number>();
  const viewCache = new PdfViewCache(options.viewCacheDirectory || path.join(app.isPackaged ? app.getPath('userData') : path.join(app.getAppPath(), '.baglib-data'), 'cache', 'pdf-view'), async (...args) => {
    const tools = pdfEngineTools();
    await pdfViewOptimizer(tools.python, path.join(path.dirname(tools.script), 'view_cache.py'))(...args);
  }, { onChanged: (ownerId, id) => {
    const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.id === ownerId);
    if (window && !window.isDestroyed()) window.webContents.send('pdf-editor:view-source-changed', id);
  } });
  viewCaches.add(viewCache);

  if (!lifecycleHooksRegistered) {
    lifecycleHooksRegistered = true;
    defaultStirlingSidecar.onStatusChange(info => {
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed()) {
            win.webContents.send('pdf-editor:engine-status-changed', info);
          }
        } catch { /* ignore */ }
      }
    });
    const cleanup = () => { void defaultStirlingSidecar.stop(); };
    app.once('before-quit', cleanup);
    app.once('will-quit', cleanup);
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
  }

  const controller = () => jobs ||= new PdfEditorJobs(getDatabase(), path.join(app.getPath('userData'), 'pdf-editor', 'jobs'), async (input, signal, progress) => {
    const tools = pdfEngineTools();
    const useStirling = isStirlingConfigured(tools);
    if (!useStirling) return runPdfWorker(input, signal, progress);
    const audit = new PdfAudit(settingsRepository, safeStorage);
    if (['sign', 'prepare-signature'].includes(input.operation) && !audit.verify().valid) throw new Error('invalid-output');
    const result = await runStirlingPdf(tools, input, signal, progress);
    if (input.operation === 'sign' || input.operation === 'prepare-signature' || input.operation === 'verify-signatures') {
      const signature = input.operation === 'sign' || input.operation === 'prepare-signature' ? result.signature : result;
      const record = signature as { status?: string; signatures?: { fingerprint?: string; subject?: string }[] };
      getDatabase().transaction(() => audit.append({ operation: input.operation, sourceHash: input.expectedHash, outputHash: result.outputs?.[0]?.sha256 || input.expectedHash, status: record.status || 'Draft', certificateFingerprint: record.signatures?.at(-1)?.fingerprint, signer: record.signatures?.at(-1)?.subject }))();
    }
    return input.operation === 'inspect' ? stirlingInspection(result) : result;
  });
  const owner = (event: IpcMainInvokeEvent) => {
    const url = new URL(event.sender.getURL());
    if (event.senderFrame !== event.sender.mainFrame || !(url.protocol === 'file:' || url.protocol === 'app:' && url.hostname === '-' || url.origin === 'http://localhost:3000')) throw new Error('permission-denied');
    if (!owners.has(event.sender.id)) {
      const id = event.sender.id; owners.add(id);
      event.sender.once('destroyed', () => { owners.delete(id); viewCache.closeOwner(id); void jobs?.closeOwner(id); });
    }
    return event.sender.id;
  };
  const result = async <T>(event: IpcMainInvokeEvent, run: (owner: number) => Promise<T> | T): Promise<PdfResult<T>> => {
    try { return { ok: true, data: await run(owner(event)) }; }
    catch (error) {
      const code = (error as Error).message;
      return { ok: false, error: (['invalid-request', 'invalid-source', 'source-required', 'source-changed', 'encrypted', 'permission-denied', 'unsupported', 'busy', 'cancelled', 'engine-missing', 'signed-document-locked', 'owner-password-required', 'invalid-output'].includes(code) ? code : 'storage') as PdfError };
    }
  };
  ipcMain.handle('pdf-editor:engine-status', event => result(event, () => defaultStirlingSidecar.getStatus()));
  ipcMain.handle('pdf-editor:view-source', (event, input) => result(event, ownerId => {
    if (!input || typeof input.path !== 'string' || input.path.length > 32768 || !path.isAbsolute(input.path) || input.id !== undefined && (typeof input.id !== 'string' || input.id.length > 100)) throw new Error('invalid-request');
    return viewCache.acquire(ownerId, input.path, input.id);
  }));
  ipcMain.handle('pdf-editor:release-view-source', (event, id) => result(event, ownerId => {
    if (typeof id !== 'string' || id.length > 100) throw new Error('invalid-request');
    viewCache.release(ownerId, id); return null;
  }));
  ipcMain.handle('pdf-editor:capabilities', async event => {
    owner(event); const tools = pdfEngineTools();
    const hasStirling = isStirlingConfigured(tools);
    if (!hasStirling) return pdfCapabilities();
    try {
      const featureSet = new Set<string>(['review', 'summarize']);
      const stirlingResult = await runStirlingPdf(tools, { filename: '', output: path.join(app.getPath('temp'), 'capabilities.json'), operation: 'capabilities', language: 'en', expectedHash: '' }, new AbortController().signal, () => {}).catch(() => ({ features: [] }));
      if (Array.isArray(stirlingResult.features)) for (const f of stirlingResult.features) if (typeof f === 'string') featureSet.add(f);
      return pdfCapabilities([...featureSet]);
    } catch { return pdfCapabilities(); }
  });
  registerPdfCloudIpc(controller, owner);
  registerPdfCollaborationIpc(controller, owner);
  ipcMain.handle('pdf-editor:audit', event => result(event, () => new PdfAudit(settingsRepository, safeStorage).verify()));
  ipcMain.handle('pdf-editor:open', (event, input) => result(event, owner => controller().open(owner, input?.workId, input?.sourceId)));
  ipcMain.handle('pdf-editor:sources', (event, workId) => result(event, () => {
    if (typeof workId !== 'string' || !/^[\w-]{1,180}$/u.test(workId)) throw new Error('invalid-request');
    const rows = getDatabase().prepare(`SELECT s.id, f.file_path filename FROM edition e JOIN source s ON s.edition_id=e.id JOIN file_source_detail f ON f.source_id=s.id WHERE e.work_id=? AND upper(f.file_format)='PDF' ORDER BY e.id,s.id`).all(workId) as { id: string; filename: string }[];
    return rows.map(row => ({ id: row.id, filename: path.basename(row.filename) }));
  }));
  ipcMain.handle('pdf-editor:start', (event, input) => result(event, owner => controller().start(owner, input)));
  ipcMain.handle('pdf-editor:status', (event, id) => result(event, async owner => {
    const job = controller().status(owner, id);
    if (job.state === 'completed' && job.outputs?.length === 1 && job.outputs[0].format === 'pdf') {
      const output = await controller().output(owner, id);
      job.previewUrl = readerAssetUrl(output.filename);
    }
    return job;
  }));
  ipcMain.handle('pdf-editor:cancel', (event, id) => result(event, owner => { controller().cancel(owner, id); return null; }));
  ipcMain.handle('pdf-editor:close', (event, id) => result(event, async owner => { await controller().close(owner, id); return null; }));
  ipcMain.handle('pdf-editor:blank-session', event => result(event, owner => controller().blank(owner)));
  ipcMain.handle('pdf-editor:choose-source', event => result(event, async owner => {
    const selection = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    return selection.canceled || !selection.filePaths[0] ? null : controller().openPath(owner, selection.filePaths[0]);
  }));
  ipcMain.handle('pdf-editor:choose-asset', (event, kind) => result(event, async owner => {
    const extensions = kind === 'image' ? ['png', 'jpg', 'jpeg', 'webp', 'tiff', 'bmp'] : kind === 'certificate' ? ['p12', 'pfx'] : kind === 'trust-root' ? ['pem', 'crt', 'cer'] : null;
    if (!extensions) throw new Error('invalid-request');
    const selection = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: extensions.join(', '), extensions }] });
    return selection.canceled || !selection.filePaths[0] ? null : controller().asset(owner, selection.filePaths[0], kind);
  }));
  ipcMain.handle('pdf-editor:clipboard', event => result(event, async owner => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return { text: clipboard.readText().slice(0, 100000) };
    const directory = path.join(app.getPath('userData'), 'pdf-editor', 'clipboard'); await mkdir(directory, { recursive: true });
    const temporary = path.join(directory, `${randomUUID()}.png`);
    try { await writeFile(temporary, image.toPNG(), { flag: 'wx', mode: 0o600 }); return { asset: await controller().asset(owner, temporary, 'image') }; }
    finally { await unlink(temporary).catch(() => {}); }
  }));
  const save = async (event: IpcMainInvokeEvent, owner: number, input: PdfSaveRequest) => {
    if (!input || !['copy', 'overwrite', 'edition', 'new-work'].includes(input.mode)) throw new Error('invalid-request');
    const output = await controller().output(owner, input.jobId, input.outputIndex);
    const source = controller().source(owner, output.job.sessionId);
    if (input.mode === 'overwrite') {
      if (!source.path || output.format !== 'pdf') throw new Error('invalid-request');
      const backupDirectory = app.isPackaged ? path.join(app.getPath('userData'), 'backups') : path.join(app.getAppPath(), '.baglib-data', 'backups');
      const backupFilename = `${source.sourceId || randomUUID()}_${Date.now()}.pdf`;
      const publication = await publishPdfOutput({ staged: output.filename, target: source.path, stagedSha256: output.sha256, expectedTargetSha256: source.sha256, backupDirectory, backupFilename });
      try {
        if (source.sourceId) {
          const size = (await stat(source.path)).size, db = getDatabase();
          db.transaction(() => {
            db.prepare('UPDATE file_source_detail SET file_hash=?,file_size_bytes=?,last_verified_at=? WHERE source_id=?').run(output.sha256, size, new Date().toISOString(), source.sourceId);
            db.prepare('DELETE FROM book_content_fts WHERE book_id=?').run(source.workId);
          })();
        }
      } catch (error) {
        if (publication.backup) await publishPdfOutput({ staged: publication.backup, target: source.path, stagedSha256: source.sha256, expectedTargetSha256: output.sha256 });
        throw error;
      }
      const session = controller().rebase(owner, output.job.sessionId, output.sha256);
      event.sender.send('pdf-editor:source-changed', { workId: source.workId, sourceId: source.sourceId });
      return { saved: true, backup: publication.backup, session };
    }
    if (input.mode === 'edition' || input.mode === 'new-work') {
      if (output.format !== 'pdf' || input.mode === 'edition' && !source.workId || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 1000) throw new Error('invalid-request');
      const directory = path.join(app.getPath('userData'), 'pdf-editor', 'documents'); await mkdir(directory, { recursive: true });
      const filename = path.join(directory, `${randomUUID()}.pdf`), workId = input.mode === 'edition' ? source.workId! : randomUUID();
      await publishPdfOutput({ staged: output.filename, target: filename, stagedSha256: output.sha256 });
      try {
        const db = getDatabase(), repository = new SqliteWorkRepository(db);
        db.transaction(() => {
          if (input.mode === 'edition') { if (!repository.addEditionToWork(workId, { edition: input.title, filePath: filename, fileHash: output.sha256, digitalFormat: 'PDF' })) throw new Error('invalid-source'); }
          else repository.addBook({ id: workId, title: input.title!, author: '', workType: 'book', bookType: 'digital', filePath: filename, digitalFormat: 'PDF' });
          db.prepare('UPDATE file_source_detail SET file_hash=?,file_size_bytes=?,is_managed=1 WHERE file_path=?').run(output.sha256, fs.statSync(filename).size, filename);
        })();
      } catch (error) { await unlink(filename).catch(() => {}); throw error; }
      const sourceRow = getDatabase().prepare('SELECT source_id id FROM file_source_detail WHERE file_path=?').get(filename) as { id: string };
      const session = await controller().open(owner, workId, sourceRow.id);
      return { saved: true, session };
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = { defaultPath: path.basename(output.filename), filters: [{ name: output.format.toUpperCase(), extensions: [output.format] }] };
    const selection = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (selection.canceled || !selection.filePath) return { saved: false };
    if (path.extname(selection.filePath).toLowerCase() !== `.${output.format}`) throw new Error('invalid-request');
    await publishPdfOutput({ staged: output.filename, target: selection.filePath, stagedSha256: output.sha256 });
    return { saved: true };
  };
  ipcMain.handle('pdf-editor:save', (event, input) => result(event, owner => save(event, owner, input)));
  ipcMain.handle('pdf-editor:save-copy', (event, id) => result(event, owner => save(event, owner, { jobId: id, mode: 'copy' })));
  ipcMain.handle('pdf-editor:pipelines:list', event => result(event, () => stirlingProcessor.listPipelines()));
  ipcMain.handle('pdf-editor:pipelines:save', (event, input) => result(event, () => stirlingProcessor.savePipeline(input as StirlingPipeline)));
  ipcMain.handle('pdf-editor:pipelines:delete', (event, id) => result(event, () => stirlingProcessor.deletePipeline(id)));
  ipcMain.handle('pdf-editor:pipelines:execute', (event, input) => result(event, async () => {
    const tools = pdfEngineTools();
    return stirlingProcessor.executePipeline(tools, input.filePaths, input.pipelineConfig, new AbortController().signal);
  }));
  ipcMain.handle('pdf-editor:pipelines:export-automate', (event, pipeline) => result(event, () => exportPipelineAutomateJson(pipeline as StirlingPipeline)));
  ipcMain.handle('pdf-editor:pipelines:export-folder-scan', (event, folder, pipeline) => result(event, () => exportPipelineFolderScanJson(folder as WatchedFolderSource, pipeline as StirlingPipeline)));
  ipcMain.handle('pdf-editor:pipelines:import', (event, jsonContent: string) => result(event, () => stirlingProcessor.savePipeline(importPipelineJson(jsonContent))));
  ipcMain.handle('pdf-editor:processor:check-folders', event => result(event, async () => {
    const tools = pdfEngineTools();
    return stirlingProcessor.checkWatchedFolders(tools);
  }));
  ipcMain.handle('pdf-editor:processor:telemetry', event => result(event, () => stirlingProcessor.getTelemetry()));
  ipcMain.handle('pdf-editor:processor:policies', event => result(event, () => stirlingProcessor.getPolicies()));
  ipcMain.handle('pdf-editor:processor:save-policies', (event, input) => result(event, () => stirlingProcessor.savePolicies(input as Partial<StirlingGovernancePolicies>)));
  ipcMain.handle('pdf-editor:processor:folders', event => result(event, () => stirlingProcessor.getWatchedFolders()));
  ipcMain.handle('pdf-editor:processor:save-folders', (event, input) => result(event, () => stirlingProcessor.saveWatchedFolders(input as WatchedFolderSource[])));

  ipcMain.handle('pdf-editor:versions:list', (event, sessionId: string) => result(event, async owner => {
    const source = controller().source(owner, sessionId);
    const backupDirectory = app.isPackaged ? path.join(app.getPath('userData'), 'backups') : path.join(app.getAppPath(), '.baglib-data', 'backups');
    await mkdir(backupDirectory, { recursive: true });
    const files = await readdir(backupDirectory).catch(() => []);
    const prefix = source.sourceId ? `${source.sourceId}_` : '';
    const matching = files.filter(f => f.endsWith('.pdf') && (prefix ? f.startsWith(prefix) : true));
    const items: PdfVersionItem[] = [];
    for (const file of matching) {
      try {
        const filePath = path.join(backupDirectory, file);
        const s = await stat(filePath);
        const match = /_(\d+)\.pdf$/u.exec(file);
        const timestamp = match ? Number.parseInt(match[1], 10) : s.mtimeMs;
        items.push({
          filename: file,
          timestamp,
          dateStr: new Date(timestamp).toLocaleString(),
          size: s.size,
        });
      } catch {
        /* ignore */
      }
    }
    items.sort((a, b) => b.timestamp - a.timestamp);
    return items;
  }));

  ipcMain.handle('pdf-editor:versions:restore', (event, sessionId: string, versionFilename: string) => result(event, async owner => {
    const safeFilename = path.basename(versionFilename);
    const source = controller().source(owner, sessionId);
    if (!source.path) throw new Error('invalid-source');
    const backupDirectory = app.isPackaged ? path.join(app.getPath('userData'), 'backups') : path.join(app.getAppPath(), '.baglib-data', 'backups');
    const backupPath = path.join(backupDirectory, safeFilename);
    if (!fs.existsSync(backupPath)) throw new Error('invalid-request');

    const newBackupFilename = `${source.sourceId || randomUUID()}_${Date.now()}.pdf`;
    await copyFile(source.path, path.join(backupDirectory, newBackupFilename)).catch(() => {});

    await copyFile(backupPath, source.path);
    const newHash = await fileSha256(source.path);
    const size = (await stat(source.path)).size;

    if (source.sourceId) {
      const db = getDatabase();
      db.transaction(() => {
        db.prepare('UPDATE file_source_detail SET file_hash=?,file_size_bytes=?,last_verified_at=? WHERE source_id=?').run(newHash, size, new Date().toISOString(), source.sourceId);
        db.prepare('DELETE FROM book_content_fts WHERE book_id=?').run(source.workId);
      })();
    }
    const session = controller().rebase(owner, sessionId, newHash, true);
    event.sender.send('pdf-editor:source-changed', { workId: source.workId, sourceId: source.sourceId });
    return { restored: true, session };
  }));

  ipcMain.handle('pdf-editor:versions:undo', (event, sessionId: string) => result(event, async owner => {
    const source = controller().source(owner, sessionId);
    if (!source.path) throw new Error('invalid-source');
    const backupDirectory = app.isPackaged ? path.join(app.getPath('userData'), 'backups') : path.join(app.getAppPath(), '.baglib-data', 'backups');
    const files = await readdir(backupDirectory).catch(() => []);
    const prefix = source.sourceId ? `${source.sourceId}_` : '';
    const matching = files.filter(f => f.endsWith('.pdf') && (prefix ? f.startsWith(prefix) : true));
    if (!matching.length) throw new Error('invalid-request');
    const sorted = matching.map(f => {
      const m = /_(\d+)\.pdf$/u.exec(f);
      return { file: f, ts: m ? Number.parseInt(m[1], 10) : 0 };
    }).sort((a, b) => b.ts - a.ts);
    const latest = sorted[0]?.file;
    if (!latest) throw new Error('invalid-request');
    const backupPath = path.join(backupDirectory, latest);

    const newBackupFilename = `${source.sourceId || randomUUID()}_${Date.now()}.pdf`;
    await copyFile(source.path, path.join(backupDirectory, newBackupFilename)).catch(() => {});

    await copyFile(backupPath, source.path);
    const newHash = await fileSha256(source.path);
    const size = (await stat(source.path)).size;

    if (source.sourceId) {
      const db = getDatabase();
      db.transaction(() => {
        db.prepare('UPDATE file_source_detail SET file_hash=?,file_size_bytes=?,last_verified_at=? WHERE source_id=?').run(newHash, size, new Date().toISOString(), source.sourceId);
        db.prepare('DELETE FROM book_content_fts WHERE book_id=?').run(source.workId);
      })();
    }
    const session = controller().rebase(owner, sessionId, newHash, true);
    event.sender.send('pdf-editor:source-changed', { workId: source.workId, sourceId: source.sourceId });
    return { restored: true, session };
  }));

  ipcMain.handle('pdf-editor:versions:delete', (event, versionFilename: string) => result(event, async () => {
    const safeFilename = path.basename(versionFilename);
    const backupDirectory = app.isPackaged ? path.join(app.getPath('userData'), 'backups') : path.join(app.getAppPath(), '.baglib-data', 'backups');
    const target = path.join(backupDirectory, safeFilename);
    await unlink(target);
    return true;
  }));
}
