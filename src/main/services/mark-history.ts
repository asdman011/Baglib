import type { Database } from 'better-sqlite3';
import { KnowledgeHistoryService, headRevision, withKnowledgeHistory, NON_USER_HISTORY_ACTIONS } from './knowledge-history';

/**
 * Undo and redo of a material's marks and notes that survive a restart (ADR-012). Each user action is one history
 * batch (ADR-008 `entity_version.batch_id`); undo walks those batches newest first and redo re-applies them. The
 * history holds database snapshots, never PDF copies; the result is an ordinary pending change under the save
 * policy. Restoring the emergency PDF is a separate recovery action and never happens here.
 */
const NOT_USER_ACTIONS = NON_USER_HISTORY_ACTIONS;
const MARK_TYPES = ['highlight', 'note', 'question', 'bookmark', 'quote', 'study_note'];

export interface RedoStore { redoStack(workId: string): string[]; setRedoStack(workId: string, stack: string[]): void; discardedBatches?(workId: string): string[] }
export type MarkHistoryErrorCode = 'nothing-to-undo' | 'nothing-to-redo' | 'history-unappliable';
export class MarkHistoryError extends Error {
  constructor(readonly code: MarkHistoryErrorCode) { super(code); }
}
interface Batch { batch: string; at: string; action: string; sequence: number; kind: string; actor: string | null }
interface Version { id: string; revision: number; batch: string; at: string }
export interface HistoryStep { batch: string; items: number; action: string }

export class MarkHistoryService {
  private readonly history: KnowledgeHistoryService;
  constructor(private readonly db: Database, private readonly store: RedoStore) { this.history = new KnowledgeHistoryService(db); }

  private ids(workId: string): string[] {
    return (this.db.prepare(`SELECT id FROM knowledge WHERE work_id = ? AND knowledge_type IN (${MARK_TYPES.map(() => '?').join(',')})`).all(workId, ...MARK_TYPES) as { id: string }[]).map(row => row.id);
  }
  /** User batches of this material, newest first. */
  private readerOnly(): boolean {
    const row = this.db.prepare("SELECT value FROM app_settings WHERE key='undo.scope.v1'").get() as { value: string } | undefined;
    return row?.value === 'reader' || row?.value === '"reader"';
  }
  private batches(workId: string, scoped = true): Batch[] {
    const ids = this.ids(workId);
    if (!ids.length) return [];
    return this.db.prepare(`SELECT batch_id AS batch, MAX(v.created_at) AS at, MIN(action) AS action, MAX(v.rowid) AS sequence, MIN(k.knowledge_type) AS kind, MIN(actor) AS actor FROM entity_version v JOIN knowledge k ON k.id=v.entity_id
      WHERE entity_type = 'knowledge' AND batch_id IS NOT NULL AND entity_id IN (${ids.map(() => '?').join(',')}) AND action NOT IN (${NOT_USER_ACTIONS.map(() => '?').join(',')}) ${scoped && this.readerOnly() ? "AND actor = 'reader'" : ''}
      GROUP BY batch_id ORDER BY sequence DESC`).all(...ids, ...NOT_USER_ACTIONS) as Batch[];
  }
  private versions(batch: string, workId: string): Version[] {
    return this.db.prepare(`SELECT entity_id AS id, revision, batch_id AS batch, v.created_at AS at FROM entity_version v JOIN knowledge k ON k.id=v.entity_id WHERE entity_type='knowledge' AND batch_id=? AND k.work_id=? AND action NOT IN (${NOT_USER_ACTIONS.map(() => '?').join(',')})`).all(batch, workId, ...NOT_USER_ACTIONS) as Version[];
  }
  private describe(step: Batch): string { return [step.kind, step.action, step.actor === 'reader' ? 'reader' : 'notes'].join('|'); }
  private applyStep(workId: string, step: Batch, operation: (versions: Version[]) => void) {
    try {
      return this.db.transaction(() => {
        const versions = this.versions(step.batch, workId);
        if (!versions.length) throw new MarkHistoryError('history-unappliable');
        // Skipping another view must never overwrite its newer changes to the same item.
        if (this.readerOnly()) {
          const excluded = new Set([...this.store.redoStack(workId), ...this.store.discardedBatches?.(workId) || []]);
          const later = this.batches(workId, false).filter(batch => batch.sequence > step.sequence && !excluded.has(batch.batch));
          if (later.some(batch => this.versions(batch.batch, workId).some(version => versions.some(target => target.id === version.id)))) throw new MarkHistoryError('history-unappliable');
        }
        operation(versions);
        return { batch: step.batch, items: versions.length, action: this.describe(step) };
      })();
    } catch (error) {
      if (error instanceof MarkHistoryError) throw error;
      throw new MarkHistoryError('history-unappliable');
    }
  }

  /** Brings an item to the state of one revision; a revision in which it was deleted means trashing it. */
  private apply(id: string, revision: number, action: 'undo' | 'redo') {
    const snapshot = this.history.read(id, revision) as { knowledge: { deleted_at?: unknown } | null };
    if (!snapshot.knowledge || snapshot.knowledge.deleted_at) this.trash(id, action);
    else this.history.restore(id, revision, headRevision(this.db, id), true, action);
  }
  private trash(id: string, action: 'undo' | 'redo') {
    withKnowledgeHistory(this.db, [id], action, () => {
      const now = new Date().toISOString();
      this.db.prepare('UPDATE knowledge SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, now, id);
      this.db.prepare('DELETE FROM annotations WHERE id = ?').run(id);
    });
  }

  undo(workId: string): HistoryStep {
    const undone = this.store.redoStack(workId);
    const excluded = new Set([...undone, ...this.store.discardedBatches?.(workId) || []]);
    const step = this.batches(workId).find(entry => !excluded.has(entry.batch));
    if (!step) throw new MarkHistoryError('nothing-to-undo');
    return this.applyStep(workId, step, versions => {
      for (const version of versions) {
        const previous = this.db.prepare("SELECT MAX(revision) AS revision FROM entity_version WHERE entity_type='knowledge' AND entity_id=? AND revision<?").get(version.id, version.revision) as { revision: number | null };
        if (previous.revision) this.apply(version.id, previous.revision, 'undo'); else this.trash(version.id, 'undo');
      }
      this.store.setRedoStack(workId, [...undone, step.batch]);
    });
  }

  redo(workId: string): HistoryStep {
    const stack = this.store.redoStack(workId);
    const batch = stack.at(-1);
    if (!batch) throw new MarkHistoryError('nothing-to-redo');
    const step = this.batches(workId).find(entry => entry.batch === batch);
    if (!step) throw new MarkHistoryError('history-unappliable');
    // Compatibility for in-memory stores used by callers without material_save_state.
    const newest = this.batches(workId).find(entry => !stack.includes(entry.batch));
    const ids = this.ids(workId);
    const last = this.db.prepare(`SELECT MAX(rowid) AS sequence FROM entity_version WHERE entity_type='knowledge' AND entity_id IN (${ids.map(() => '?').join(',')}) AND action IN ('undo','redo')`).get(...ids) as { sequence: number | null };
    if (newest && last.sequence !== null && newest.sequence > last.sequence) { this.store.setRedoStack(workId, []); throw new MarkHistoryError('nothing-to-redo'); }
    return this.applyStep(workId, step, versions => {
      for (const version of versions) this.apply(version.id, version.revision, 'redo');
      this.store.setRedoStack(workId, stack.slice(0, -1));
    });
  }
}
