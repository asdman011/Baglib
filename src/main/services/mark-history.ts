import type { Database } from 'better-sqlite3';
import { KnowledgeHistoryService, headRevision, withKnowledgeHistory } from './knowledge-history';

/**
 * Undo and redo of a material's marks and notes that survive a restart (ADR-012). Each user action is one history
 * batch (ADR-008 `entity_version.batch_id`); undo walks those batches newest first and redo re-applies them. The
 * history holds database snapshots, never PDF copies; the result is an ordinary pending change under the save
 * policy. Restoring the emergency PDF is a separate recovery action and never happens here.
 */
const NOT_USER_ACTIONS = ['undo', 'redo', 'baseline', 'capture', 'conversion', 'book-detached'];
const MARK_TYPES = ['highlight', 'note', 'question', 'bookmark', 'quote'];

export interface RedoStore { redoStack(workId: string): string[]; setRedoStack(workId: string, stack: string[]): void }
interface Version { id: string; revision: number; batch: string; at: string }
export interface HistoryStep { batch: string; items: number; action: string }

export class MarkHistoryService {
  private readonly history: KnowledgeHistoryService;
  constructor(private readonly db: Database, private readonly store: RedoStore) { this.history = new KnowledgeHistoryService(db); }

  private ids(workId: string): string[] {
    return (this.db.prepare(`SELECT id FROM knowledge WHERE work_id = ? AND knowledge_type IN (${MARK_TYPES.map(() => '?').join(',')})`).all(workId, ...MARK_TYPES) as { id: string }[]).map(row => row.id);
  }
  /** User batches of this material, newest first. */
  private batches(workId: string): { batch: string; at: string; action: string; sequence: number }[] {
    const ids = this.ids(workId);
    if (!ids.length) return [];
    return this.db.prepare(`SELECT batch_id AS batch, MAX(created_at) AS at, MIN(action) AS action, MAX(rowid) AS sequence FROM entity_version
      WHERE entity_type = 'knowledge' AND batch_id IS NOT NULL AND entity_id IN (${ids.map(() => '?').join(',')}) AND action NOT IN (${NOT_USER_ACTIONS.map(() => '?').join(',')})
      GROUP BY batch_id ORDER BY sequence DESC LIMIT 500`).all(...ids, ...NOT_USER_ACTIONS) as { batch: string; at: string; action: string; sequence: number }[];
  }
  private versions(batch: string): Version[] {
    return this.db.prepare("SELECT entity_id AS id, revision, batch_id AS batch, created_at AS at FROM entity_version WHERE entity_type = 'knowledge' AND batch_id = ?").all(batch) as Version[];
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
    const step = this.batches(workId).find(entry => !undone.includes(entry.batch));
    if (!step) throw new Error('nothing-to-undo');
    const versions = this.versions(step.batch);
    this.db.transaction(() => {
      for (const version of versions) {
        const previous = this.db.prepare("SELECT MAX(revision) AS revision FROM entity_version WHERE entity_type = 'knowledge' AND entity_id = ? AND revision < ?").get(version.id, version.revision) as { revision: number | null };
        // No earlier revision: the action created the item, so undoing it moves it to the trash (still recoverable).
        if (previous.revision) this.apply(version.id, previous.revision, 'undo'); else this.trash(version.id, 'undo');
      }
    })();
    this.store.setRedoStack(workId, [...undone, step.batch]);
    return { batch: step.batch, items: versions.length, action: step.action };
  }

  redo(workId: string): HistoryStep {
    const stack = this.store.redoStack(workId);
    const batch = stack.at(-1);
    if (!batch) throw new Error('nothing-to-redo');
    // A new action after the undo makes redo meaningless, as in any editor.
    const newest = this.batches(workId).find(entry => !stack.includes(entry.batch));
    const ids = this.ids(workId);
    if (!ids.length) throw new Error('nothing-to-redo');
    const undone = this.db.prepare(`SELECT MAX(rowid) AS sequence FROM entity_version WHERE entity_type = 'knowledge' AND entity_id IN (${ids.map(() => '?').join(',')}) AND action IN ('undo','redo')`).get(...ids) as { sequence: number | null };
    if (newest && undone.sequence !== null && newest.sequence > undone.sequence) { this.store.setRedoStack(workId, []); throw new Error('nothing-to-redo'); }
    const versions = this.versions(batch);
    this.db.transaction(() => {
      for (const version of versions) this.apply(version.id, version.revision, 'redo');
    })();
    this.store.setRedoStack(workId, stack.slice(0, -1));
    return { batch, items: versions.length, action: 'redo' };
  }
}
