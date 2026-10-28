import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import fs from 'node:fs';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getDatabase } from '../database/connection';
import { PdfEditorJobs } from '../services/pdf-editor/jobs';
import { runPdfWorker } from '../services/pdf-editor/process';
import { publishPdfOutput } from '../services/pdf-editor/publication';
import { pdfCapabilities, type PdfError, type PdfResult } from '../../shared/types/pdf-editor';
import { registerPdfCloudIpc } from './pdf-cloud';
import { registerPdfCollaborationIpc } from './pdf-collaboration';
import { pdfEngineTools } from '../services/pdf-editor/tools';
import { runPythonPdf, pythonInspection, type PdfEngineTools } from '../services/pdf-editor/python';
import { canStirlingHandle, runStirlingPdf } from '../services/pdf-editor/stirling';
import { SqliteWorkRepository } from '../database/repositories/work.repository';
import type { PdfSaveRequest } from '../../shared/types/pdf-editor';
import { PdfAudit } from '../services/pdf-editor/audit';
import { settingsRepository } from '../database/repositories/settings.repository';

function isStirlingConfigured(tools: PdfEngineTools): boolean {
  return Boolean(tools.stirlingUrl || (tools.java && tools.stirlingJar && fs.existsSync(tools.java) && fs.existsSync(tools.stirlingJar)));
}

export function registerPdfEditorIpc(): void {
  let jobs: PdfEditorJobs | undefined;
  const owners = new Set<number>();
  const controller = () => jobs ||= new PdfEditorJobs(getDatabase(), path.join(app.getPath('userData'), 'pdf-editor', 'jobs'), async (input, signal, progress) => {
    const tools = pdfEngineTools();
    const hasPython = fs.existsSync(tools.python);
    const useStirling = isStirlingConfigured(tools) && canStirlingHandle(input.operation, input.payload);
    if (!hasPython && !useStirling) return runPdfWorker(input, signal, progress);
    const audit = new PdfAudit(settingsRepository, safeStorage);
    if (['sign', 'prepare-signature'].includes(input.operation) && !audit.verify().valid) throw new Error('invalid-output');
    const result = useStirling && (tools.preferStirling || !hasPython)
      ? await runStirlingPdf(tools, input, signal, progress).catch(async error => {
        if (hasPython && (error as Error).message === 'engine-missing') return runPythonPdf(tools, input, signal, progress);
        throw error;
      })
      : await runPythonPdf(tools, input, signal, progress);
    if (input.operation === 'sign' || input.operation === 'prepare-signature' || input.operation === 'verify-signatures') {
      const signature = input.operation === 'sign' || input.operation === 'prepare-signature' ? result.signature : result;
      const record = signature as { status?: string; signatures?: { fingerprint?: string; subject?: string }[] };
      getDatabase().transaction(() => audit.append({ operation: input.operation, sourceHash: input.expectedHash, outputHash: result.outputs?.[0]?.sha256 || input.expectedHash, status: record.status || 'Draft', certificateFingerprint: record.signatures?.at(-1)?.fingerprint, signer: record.signatures?.at(-1)?.subject }))();
    }
    return input.operation === 'inspect' ? pythonInspection(result) : result;
  });
  const owner = (event: IpcMainInvokeEvent) => {
    const url = new URL(event.sender.getURL());
    if (event.senderFrame !== event.sender.mainFrame || !(url.protocol === 'file:' || url.protocol === 'app:' && url.hostname === '-' || url.origin === 'http://localhost:3000')) throw new Error('permission-denied');
    if (!owners.has(event.sender.id)) {
      const id = event.sender.id; owners.add(id);
      event.sender.once('destroyed', () => { owners.delete(id); void jobs?.closeOwner(id); });
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
  ipcMain.handle('pdf-editor:capabilities', async event => {
    owner(event); const tools = pdfEngineTools();
    const hasPython = fs.existsSync(tools.python);
    const hasStirling = isStirlingConfigured(tools);
    if (!hasPython && !hasStirling) return pdfCapabilities();
    try {
      const featureSet = new Set<string>(['review', 'summarize']);
      if (hasPython) {
        const pyResult = await runPythonPdf(tools, { filename: '', output: path.join(app.getPath('temp'), 'capabilities.json'), operation: 'capabilities', language: 'en', expectedHash: '' }, new AbortController().signal, () => {});
        if (Array.isArray(pyResult.features)) for (const f of pyResult.features) if (typeof f === 'string') featureSet.add(f);
      }
      if (hasStirling) {
        const stirlingResult = await runStirlingPdf(tools, { filename: '', output: path.join(app.getPath('temp'), 'capabilities.json'), operation: 'capabilities', language: 'en', expectedHash: '' }, new AbortController().signal, () => {}).catch(error => {
          if (hasPython && (error as Error).message === 'engine-missing') return { features: [] };
          throw error;
        });
        if (Array.isArray(stirlingResult.features)) for (const f of stirlingResult.features) if (typeof f === 'string') featureSet.add(f);
      }
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
  ipcMain.handle('pdf-editor:status', (event, id) => result(event, owner => controller().status(owner, id)));
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
      const publication = await publishPdfOutput({ staged: output.filename, target: source.path, stagedSha256: output.sha256, expectedTargetSha256: source.sha256 });
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
}
