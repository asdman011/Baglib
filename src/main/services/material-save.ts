import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { parseMaterialHistory } from './knowledge-history';
import { publishPdfOutput } from './pdf-editor/publication';
import { fileSha256 } from './pdf-editor/source';
import { BACKUP_RETENTION_MS, additionsKey, collectAdditions, filterForExport, type AdditionsPayload, type CommentRow, type ExportOptions, type MarkRow, type MaterialSaveStatus } from '../../shared/material-save';

/**
 * ADR-012: writes BagLib's additions into a library PDF on the user's save policy, keeping exactly one emergency
 * copy per file: the file as it was before the latest successful write.
 */
export interface MaterialSaveEnvironment {
  db: Database;
  python: () => string | null;          // the PDF engine's Python, or null when it is not installed
  helper: string;                       // assets/pdf-editor/baglib_marks.py
  staging: string;                      // working folder for one save at a time (emptied after each)
  backupFolder: () => string;           // the user's emergency-copy folder
  now?: () => Date;
}
interface StateRow { source_id: string; file_sha256: string | null; written_digest: string | null; last_saved_at: string | null; backup_path: string | null; backup_expires_at: string | null; incident: MaterialSaveStatus['incident']; incident_at: string | null; redo_json: string | null }
export interface SaveResult { written: boolean; reason?: 'nothing-pending'; externalChange?: boolean; sha256?: string }

const run = (python: string, args: string[]) => new Promise<string>((resolve, reject) => {
  execFile(python, ['-I', ...args], { windowsHide: true, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(new Error(`pdf-helper-failed: ${String(stderr || error.message).slice(-400)}`)); else resolve(stdout);
  });
});
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

export class MaterialSaveService {
  private readonly locks = new Set<string>();
  private engineChecked: Promise<boolean> | null = null;
  constructor(private readonly env: MaterialSaveEnvironment) {}
  private now() { return this.env.now?.() ?? new Date(); }

  /** The Source that owns a library book's PDF file (Work → Edition → Source). */
  file(workId: string): { sourceId: string; path: string } | null {
    const row = this.env.db.prepare(`SELECT s.id AS sourceId, fsd.file_path AS path FROM edition e JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id WHERE e.work_id = ? AND fsd.file_path IS NOT NULL AND lower(fsd.file_path) LIKE '%.pdf' LIMIT 1`).get(workId) as { sourceId: string; path: string } | undefined;
    return row && existsSync(row.path) ? row : null;
  }

  /** The Source that owns a library book's file (Work → Edition → Source), PDF, EPUB, or other format. */
  materialSource(workId: string): { sourceId: string; path: string } | null {
    // Always preserve PDF file precedence so existing PDF save/redo states are never hijacked
    const pdf = this.file(workId);
    if (pdf) return pdf;

    // Otherwise, check for any other valid format (e.g. EPUB), deterministically ordered
    const row = this.env.db.prepare(`SELECT s.id AS sourceId, fsd.file_path AS path FROM edition e JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id WHERE e.work_id = ? AND fsd.file_path IS NOT NULL
      ORDER BY s.id ASC LIMIT 1`).get(workId) as { sourceId: string; path: string } | undefined;
    return row && existsSync(row.path) ? row : null;
  }

  additions(workId: string): AdditionsPayload {
    const rows = this.env.db.prepare(`SELECT k.id, CASE WHEN k.knowledge_type='study_note' THEN 'note' ELSE k.knowledge_type END AS type, COALESCE(k.location,'') AS location, k.created_at AS createdAt, k.updated_at AS updatedAt,
        hd.color, COALESCE(hd.quoted_text, qd2.quoted_text) AS quote, COALESCE(nd.content, snd.content) AS note, qd.question_text AS question, bd.label
      FROM knowledge k LEFT JOIN highlight_detail hd ON hd.knowledge_id = k.id LEFT JOIN quote_detail qd2 ON qd2.knowledge_id = k.id
      LEFT JOIN study_note_detail snd ON snd.knowledge_id = k.id LEFT JOIN note_detail nd ON nd.knowledge_id = k.id LEFT JOIN question_detail qd ON qd.knowledge_id = k.id LEFT JOIN bookmark_detail bd ON bd.knowledge_id = k.id
      WHERE k.work_id = ? AND k.deleted_at IS NULL AND k.knowledge_type IN ('highlight','note','question','bookmark','quote','study_note')`).all(workId) as MarkRow[];
    const comments = rows.length ? this.env.db.prepare(`SELECT c.knowledge_id AS knowledgeId, c.parent_comment_id AS parentId, c.content, c.created_at AS createdAt, c.updated_at AS updatedAt, c.resolved_at AS resolvedAt
      FROM comment c JOIN knowledge k ON k.id = c.knowledge_id WHERE k.work_id = ? AND k.deleted_at IS NULL`).all(workId) as CommentRow[] : [];
    return collectAdditions(rows, comments);
  }

  private state(sourceId: string): StateRow | undefined {
    return this.env.db.prepare('SELECT * FROM material_save_state WHERE source_id = ?').get(sourceId) as StateRow | undefined;
  }
  private upsert(sourceId: string, fields: Partial<Omit<StateRow, 'source_id'>>) {
    const current = this.state(sourceId);
    const next = { file_sha256: null, written_digest: null, last_saved_at: null, backup_path: null, backup_expires_at: null, incident: null, incident_at: null, redo_json: null, ...current, ...fields };
    if ('incident' in fields) next.incident_at = fields.incident ? (current?.incident === fields.incident ? current.incident_at : this.now().toISOString()) : null;
    this.env.db.prepare(`INSERT INTO material_save_state(source_id,file_sha256,written_digest,last_saved_at,backup_path,backup_expires_at,incident,incident_at,redo_json,updated_at)
      VALUES(@source_id,@file_sha256,@written_digest,@last_saved_at,@backup_path,@backup_expires_at,@incident,@incident_at,@redo_json,@updated_at)
      ON CONFLICT(source_id) DO UPDATE SET file_sha256=excluded.file_sha256,written_digest=excluded.written_digest,last_saved_at=excluded.last_saved_at,backup_path=excluded.backup_path,
        backup_expires_at=excluded.backup_expires_at,incident=excluded.incident,incident_at=excluded.incident_at,redo_json=excluded.redo_json,updated_at=excluded.updated_at`)
      .run({ ...next, source_id: sourceId, updated_at: this.now().toISOString() });
  }

  async writable(): Promise<boolean> {
    const python = this.env.python();
    if (!python || !existsSync(python) || !existsSync(this.env.helper)) return false;
    this.engineChecked ??= run(python, ['-c', 'import pikepdf']).then(() => true, () => { this.engineChecked = null; return false; });
    return this.engineChecked;
  }

  async status(workId: string): Promise<MaterialSaveStatus> {
    const file = this.file(workId);
    if (!file) return { supported: false, writable: false, pending: false, lastSavedAt: null, incident: null, backup: null };
    const state = this.state(file.sourceId);
    const payload = this.additions(workId);
    // A file BagLib never wrote has nothing pending until there is something to write.
    const pending = state?.written_digest ? digest(additionsKey(payload)) !== state.written_digest : payload.items.length + payload.bookmarks.length > 0;
    return {
      supported: true, writable: await this.writable(), pending, lastSavedAt: state?.last_saved_at ?? null, incident: state?.incident ?? null,
      backup: state?.backup_path && existsSync(state.backup_path) ? { path: state.backup_path, expiresAt: state.backup_expires_at } : null,
    };
  }

  private async withLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (this.locks.has(key)) throw new Error('busy');
    this.locks.add(key);
    try { return await action(); } finally { this.locks.delete(key); }
  }
  private emergencyPath(sourceId: string) { return path.join(this.env.backupFolder(), `${sourceId}.emergency.pdf`); }
  private nextPath(sourceId: string) { return path.join(this.env.backupFolder(), `${sourceId}.emergency.next.pdf`); }

  /**
   * Publishes `staged` over the file, rotating the one emergency copy so it ends up holding the file as it was just
   * before this write. If publication fails the old emergency copy is untouched. Returns the new file's hash.
   */
  private async publishWithEmergency(sourceId: string, target: string, staged: string, currentSha: string): Promise<string> {
    const stagedSha = await fileSha256(staged);
    await mkdir(this.env.backupFolder(), { recursive: true });
    const next = this.nextPath(sourceId);
    await rm(next, { force: true });
    await copyFile(target, next);
    if (await fileSha256(next) !== currentSha) { await rm(next, { force: true }); throw new Error('source-changed'); }
    try {
      await publishPdfOutput({ staged, target, stagedSha256: stagedSha, expectedTargetSha256: currentSha, backup: false });
    } catch (error) { await rm(next, { force: true }); throw error; }
    await rename(next, this.emergencyPath(sourceId));
    return stagedSha;
  }

  private async stage(python: string, source: string, payload: AdditionsPayload): Promise<{ output: string; cleanup: () => Promise<void> }> {
    await mkdir(this.env.staging, { recursive: true });
    const id = randomUUID();
    const input = path.join(this.env.staging, `${id}.json`), output = path.join(this.env.staging, `${id}.pdf`);
    await writeFile(input, JSON.stringify(payload), { flag: 'wx' });
    const cleanup = async () => { await rm(input, { force: true }); await rm(output, { force: true }); };
    try {
      const result = JSON.parse(await run(python, [this.env.helper, 'write', source, output, input])) as { written: number; bookmarks: number };
      // Validate before anything is published: the output opens, has the same pages, and holds what was written.
      const check = JSON.parse(await run(python, [this.env.helper, 'inspect', output])) as { pages: number; owned: number; ownedOutline: number };
      const before = JSON.parse(await run(python, [this.env.helper, 'inspect', source])) as { pages: number; outside: number };
      if (check.pages !== before.pages || check.owned < result.written || check.ownedOutline !== result.bookmarks) throw new Error('corrupt-output');
      return { output, cleanup };
    } catch (error) { await cleanup(); throw error; }
  }

  /** Writes the material's BagLib additions into its PDF now (Ctrl+S, Save, or the save policy). */
  async save(workId: string, options: { force?: boolean } = {}): Promise<SaveResult> {
    const file = this.file(workId);
    if (!file) throw new Error('unsupported');
    const python = this.env.python();
    if (!python || !await this.writable()) throw new Error('engine-missing');
    return this.withLock(file.sourceId, async () => {
      const state = this.state(file.sourceId);
      if (state?.incident) throw new Error('incident');
      const payload = this.additions(workId);
      const key = digest(additionsKey(payload));
      if (!options.force && state?.written_digest === key) return { written: false, reason: 'nothing-pending' as const };
      if (!state?.written_digest && !payload.items.length && !payload.bookmarks.length) return { written: false, reason: 'nothing-pending' as const };
      const currentSha = await fileSha256(file.path);
      const externalChange = !!state?.file_sha256 && state.file_sha256 !== currentSha;
      let staged: Awaited<ReturnType<MaterialSaveService['stage']>>;
      try { staged = await this.stage(python, file.path, payload); }
      catch (error) {
        // The working file cannot be read as a PDF: keep the emergency copy until the user resolves it.
        if (/pdf-helper-failed/u.test(String((error as Error).message)) && !await run(python, [this.env.helper, 'inspect', file.path]).then(() => true, () => false)) {
          this.upsert(file.sourceId, { incident: 'corrupt' });
          throw new Error('incident');
        }
        throw error;
      }
      try {
        const sha256 = await this.publishWithEmergency(file.sourceId, file.path, staged.output, currentSha);
        const now = this.now();
        this.upsert(file.sourceId, { file_sha256: sha256, written_digest: key, last_saved_at: now.toISOString(), backup_path: this.emergencyPath(file.sourceId), backup_expires_at: new Date(now.getTime() + BACKUP_RETENTION_MS).toISOString(), incident: null });
        return { written: true, externalChange, sha256 };
      } finally { await staged.cleanup(); }
    });
  }

  /**
   * Full-file operations (OCR, compression, page edits, version restore) publish through here so they share the one
   * emergency copy instead of leaving a restore point each time.
   */
  async publishFileChange(workId: string | null, target: string, staged: string, expectedSha: string): Promise<string> {
    const sourceId = (workId && this.file(workId)?.sourceId) || this.sourceByPath(target);
    if (!sourceId) return (await publishPdfOutput({ staged, target, stagedSha256: await fileSha256(staged), expectedTargetSha256: expectedSha, backup: false })).sha256;
    return this.withLock(sourceId, async () => {
      const state = this.state(sourceId);
      if (state?.incident) throw new Error('incident');
      const sha256 = await this.publishWithEmergency(sourceId, target, staged, expectedSha);
      const now = this.now();
      // The file changed under BagLib's additions: they are pending again until the next save writes them.
      this.upsert(sourceId, { file_sha256: sha256, written_digest: null, last_saved_at: now.toISOString(), backup_path: this.emergencyPath(sourceId), backup_expires_at: new Date(now.getTime() + BACKUP_RETENTION_MS).toISOString() });
      return sha256;
    });
  }
  private sourceByPath(target: string): string | null {
    const rows = this.env.db.prepare('SELECT source_id AS id, file_path AS path FROM file_source_detail WHERE file_path IS NOT NULL').all() as { id: string; path: string }[];
    const key = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    return rows.find(row => key(row.path) === key(target))?.id ?? null;
  }

  /** An exported copy with only the chosen BagLib additions; the working file and the database are not changed. */
  async exportCopy(workId: string, options: ExportOptions, destination: string): Promise<{ items: number; bookmarks: number }> {
    const file = this.file(workId);
    if (!file) throw new Error('unsupported');
    const python = this.env.python();
    if (!python || !await this.writable()) throw new Error('engine-missing');
    const payload = filterForExport(this.additions(workId), options);
    const staged = await this.stage(python, file.path, payload);
    try {
      await publishPdfOutput({ staged: staged.output, target: destination, stagedSha256: await fileSha256(staged.output), ...(existsSync(destination) ? { expectedTargetSha256: await fileSha256(destination) } : {}), backup: false });
      return { items: payload.items.length, bookmarks: payload.bookmarks.length };
    } finally { await staged.cleanup(); }
  }

  /** Puts the emergency copy back as the working file. The replaced file becomes the emergency copy, so this can be reversed. */
  async restoreEmergency(workId: string): Promise<void> {
    const file = this.file(workId);
    if (!file) throw new Error('unsupported');
    await this.withLock(file.sourceId, async () => {
      const copy = this.state(file.sourceId)?.backup_path;
      if (!copy || !existsSync(copy)) throw new Error('no-backup');
      const held = path.join(this.env.staging, `${randomUUID()}.pdf`);
      await mkdir(this.env.staging, { recursive: true });
      await copyFile(copy, held);
      try {
        const sha256 = await this.publishWithEmergency(file.sourceId, file.path, held, await fileSha256(file.path));
        const now = this.now();
        this.upsert(file.sourceId, { file_sha256: sha256, written_digest: null, incident: null, last_saved_at: now.toISOString(), backup_expires_at: new Date(now.getTime() + BACKUP_RETENTION_MS).toISOString() });
      } finally { await rm(held, { force: true }); }
    });
  }

  /** The user keeps the current file as it is; the recovery copy then follows the normal 24-hour expiry. */
  resolveIncident(workId: string): void {
    const file = this.file(workId);
    if (!file) throw new Error('unsupported');
    const now = this.now();
    this.upsert(file.sourceId, { incident: null, backup_expires_at: new Date(now.getTime() + BACKUP_RETENTION_MS).toISOString() });
  }

  /**
   * At launch: a `.next` copy left behind means a save stopped between publishing and rotating. If the file still has
   * the `.next` bytes, nothing was published and `.next` is simply removed; otherwise the rotation is completed. Either
   * way an incident is recorded so the user is told and the copy is kept until they resolve it.
   */
  async recoverInterrupted(): Promise<number> {
    const folder = this.env.backupFolder();
    let found = 0;
    for (const name of await readdir(folder).catch(() => [] as string[])) {
      const match = /^(.+)\.emergency\.next\.pdf$/u.exec(name);
      if (!match) continue;
      const sourceId = match[1], next = path.join(folder, name);
      const row = this.env.db.prepare('SELECT file_path AS path FROM file_source_detail WHERE source_id = ?').get(sourceId) as { path: string } | undefined;
      if (!row || !existsSync(row.path)) continue;
      found++;
      if (await fileSha256(row.path) === await fileSha256(next)) await unlink(next);
      else await rename(next, this.emergencyPath(sourceId));
      this.upsert(sourceId, { incident: 'interrupted', backup_path: this.emergencyPath(sourceId) });
    }
    return found;
  }

  /** Removes emergency copies 24 hours after the last successful save, except those of unresolved incidents. */
  async cleanupExpired(): Promise<number> {
    const now = this.now().toISOString();
    const rows = this.env.db.prepare('SELECT source_id, backup_path FROM material_save_state WHERE backup_path IS NOT NULL AND incident IS NULL AND backup_expires_at IS NOT NULL AND backup_expires_at <= ?').all(now) as { source_id: string; backup_path: string }[];
    for (const row of rows) {
      await rm(row.backup_path, { force: true });
      this.env.db.prepare('UPDATE material_save_state SET backup_path = NULL, backup_expires_at = NULL, updated_at = ? WHERE source_id = ?').run(now, row.source_id);
    }
    return rows.length;
  }

  /** Leftovers of a stopped save in the staging folder (never a version collection): removed at launch. */
  async clearStaging(): Promise<void> {
    for (const name of await readdir(this.env.staging).catch(() => [] as string[])) {
      const file = path.join(this.env.staging, name);
      if ((await stat(file).catch(() => null))?.isFile()) await rm(file, { force: true });
    }
  }

  redoStack(workId: string): string[] {
    const file = this.materialSource(workId);
    const raw = file ? this.state(file.sourceId)?.redo_json : null;
    return parseMaterialHistory(raw).redo;
  }
  discardedBatches(workId: string): string[] {
    const file = this.materialSource(workId);
    return parseMaterialHistory(file ? this.state(file.sourceId)?.redo_json : null).discarded;
  }
  setRedoStack(workId: string, stack: string[]): void {
    const file = this.materialSource(workId);
    if (file) this.upsert(file.sourceId, { redo_json: JSON.stringify({ redo: stack, discarded: this.discardedBatches(workId) }) });
  }
}
