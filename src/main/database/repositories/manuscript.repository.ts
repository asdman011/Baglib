import type { Database } from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import type { Manuscript, ManuscriptDocument, ManuscriptKind, ManuscriptSave, ManuscriptVersion } from '../../../shared/manuscripts';
import { manuscriptText } from '../../../shared/manuscripts';
import { deriveManuscriptSnapshot, initialManuscriptSnapshot, renameManuscriptSnapshot } from '../../../shared/manuscript-snapshot';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';
import { validateResearchSettingsPatch } from '../../../shared/research-editor-apparatus';

const now = () => new Date().toISOString();
interface VersionContent { snapshot: string; title: string; primary_mode: ManuscriptDocument['primary_mode'] }
export class ManuscriptRepository {
  constructor(private db: Database) {}
  updateSettings(id: string, value: unknown): void {
    const settings = validateResearchSettingsPatch(value);
    this.db.transaction(() => {
      const manuscript = this.manuscript(id);
      const existing = JSON.parse(manuscript.settings_json) as Record<string, unknown>;
      const merged = { ...existing, ...settings };
      if (settings.linkedBoardId === null) delete merged.linkedBoardId;
      this.db.prepare('UPDATE manuscript SET settings_json=?,updated_at=? WHERE id=?')
        .run(JSON.stringify(merged), now(), id);
    })();
  }
  list(trashed = false): Manuscript[] {
    return this.db.prepare(`SELECT * FROM manuscript WHERE deleted_at IS ${trashed ? 'NOT NULL' : 'NULL'} ORDER BY updated_at DESC,id`).all() as Manuscript[];
  }
  private manuscript(id: string, active = true): Manuscript {
    manuscriptText(id, 200);
    const row = this.db.prepare('SELECT * FROM manuscript WHERE id=?').get(id) as Manuscript | undefined;
    if (!row || active && row.deleted_at) throw new Error('invalid-request');
    return row;
  }
  create(title: string, kind: ManuscriptKind): Manuscript {
    manuscriptText(title);
    if (kind !== 'book' && kind !== 'research') throw new Error('invalid-request');
    const id = randomUUID(), time = now();
    this.db.prepare('INSERT INTO manuscript(id,title,kind,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, title, kind, time, time);
    return this.manuscript(id);
  }
  rename(id: string, title: string): void {
    this.manuscript(id); manuscriptText(title);
    this.db.prepare('UPDATE manuscript SET title=?,updated_at=? WHERE id=?').run(title, now(), id);
  }
  trash(id: string): void {
    this.manuscript(id, false);
    this.db.prepare('UPDATE manuscript SET deleted_at=COALESCE(deleted_at,?),updated_at=? WHERE id=?').run(now(), now(), id);
  }
  restore(id: string): void {
    this.manuscript(id, false);
    this.db.prepare('UPDATE manuscript SET deleted_at=NULL,updated_at=? WHERE id=?').run(now(), id);
  }
  document(id: string): ManuscriptDocument {
    manuscriptText(id, 200);
    const row = this.db.prepare('SELECT * FROM manuscript_document WHERE id=?').get(id) as ManuscriptDocument | undefined;
    if (!row) throw new Error('invalid-request');
    return row;
  }
  private activeDocument(id: string): ManuscriptDocument {
    const row = this.document(id);
    this.manuscript(row.manuscript_id);
    const hidden = this.db.prepare(`WITH RECURSIVE ancestors(id,parent_id,deleted_at) AS (
      SELECT id,parent_id,deleted_at FROM manuscript_document WHERE id=?
      UNION SELECT p.id,p.parent_id,p.deleted_at FROM manuscript_document p JOIN ancestors a ON p.id=a.parent_id
    ) SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL LIMIT 1`).get(id);
    if (hidden) throw new Error('invalid-request');
    return row;
  }
  documents(manuscriptId: string, trashed = false): ManuscriptDocument[] {
    this.manuscript(manuscriptId);
    if (trashed) return this.db.prepare('SELECT * FROM manuscript_document WHERE manuscript_id=? AND deleted_at IS NOT NULL ORDER BY position,id').all(manuscriptId) as ManuscriptDocument[];
    return this.db.prepare(`WITH RECURSIVE visible(id) AS (
      SELECT id FROM manuscript_document WHERE manuscript_id=? AND parent_id IS NULL AND deleted_at IS NULL
      UNION ALL SELECT d.id FROM manuscript_document d JOIN visible p ON d.parent_id=p.id WHERE d.deleted_at IS NULL
    ) SELECT d.* FROM manuscript_document d JOIN visible v ON v.id=d.id ORDER BY d.position,d.id`).all(manuscriptId) as ManuscriptDocument[];
  }
  createDocument(manuscriptId: string, title: string, parentId: string | null = null): ManuscriptDocument {
    return this.db.transaction(() => {
      this.manuscript(manuscriptId); manuscriptText(title);
      if (parentId !== null && this.activeDocument(parentId).manuscript_id !== manuscriptId) throw new Error('invalid-request');
      const id = randomUUID();
      const position = (this.db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS position FROM manuscript_document WHERE manuscript_id=? AND parent_id IS ?').get(manuscriptId, parentId) as { position: number }).position;
      this.db.prepare('INSERT INTO manuscript_document(id,manuscript_id,parent_id,title,position,snapshot,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, manuscriptId, parentId, title, position, initialManuscriptSnapshot(id, title), now());
      return this.save({ id, snapshot: initialManuscriptSnapshot(id, title) });
    })();
  }
  renameDocument(id: string, title: string): void {
    manuscriptText(title);
    this.db.transaction(() => {
      const doc = this.activeDocument(id);
      this.db.prepare('UPDATE manuscript_document SET title=? WHERE id=?').run(title, id);
      this.save({ id, snapshot: renameManuscriptSnapshot(doc.snapshot, title) });
    })();
  }
  moveDocument(id: string, parentId: string | null, position: number): void {
    if (!Number.isSafeInteger(position) || position < 0) throw new Error('invalid-request');
    this.db.transaction(() => {
      const doc = this.activeDocument(id);
      if (parentId !== null) {
        if (this.activeDocument(parentId).manuscript_id !== doc.manuscript_id) throw new Error('invalid-request');
        const cycle = this.db.prepare(`WITH RECURSIVE descendants(id) AS (
          SELECT id FROM manuscript_document WHERE id=? UNION SELECT d.id FROM manuscript_document d JOIN descendants p ON d.parent_id=p.id
        ) SELECT 1 FROM descendants WHERE id=?`).get(id, parentId);
        if (cycle) throw new Error('invalid-request');
      }
      const siblings = (parent: string | null) => this.db.prepare('SELECT id FROM manuscript_document WHERE manuscript_id=? AND parent_id IS ? AND id<>? ORDER BY position,id').all(doc.manuscript_id, parent, id) as { id: string }[];
      const target = siblings(parentId);
      target.splice(Math.min(position, target.length), 0, { id });
      this.db.prepare('UPDATE manuscript_document SET parent_id=? WHERE id=?').run(parentId, id);
      const update = this.db.prepare('UPDATE manuscript_document SET position=?,updated_at=? WHERE id=?');
      if (doc.parent_id !== parentId) siblings(doc.parent_id).forEach((row, index) => update.run(index, now(), row.id));
      target.forEach((row, index) => update.run(index, now(), row.id));
      this.touch(doc.manuscript_id);
    })();
  }
  trashDocument(id: string): void {
    const existing = this.document(id);
    this.manuscript(existing.manuscript_id);
    if (existing.deleted_at) return;
    const doc = this.activeDocument(id);
    this.db.transaction(() => {
      this.db.prepare('UPDATE manuscript_document SET deleted_at=?,updated_at=? WHERE id=?').run(now(), now(), id);
      this.touch(doc.manuscript_id);
    })();
  }
  restoreDocument(id: string): void {
    this.db.transaction(() => {
      const doc = this.document(id);
      this.manuscript(doc.manuscript_id);
      if (doc.parent_id) this.activeDocument(doc.parent_id);
      this.db.prepare('UPDATE manuscript_document SET deleted_at=NULL,updated_at=? WHERE id=?').run(now(), id);
      this.touch(doc.manuscript_id);
    })();
  }
  private touch(id: string): void { this.db.prepare('UPDATE manuscript SET updated_at=? WHERE id=?').run(now(), id); }
  save(input: ManuscriptSave): ManuscriptDocument {
    if (!input || typeof input !== 'object') throw new Error('invalid-request');
    if (input.primary_mode !== undefined && input.primary_mode !== 'page' && input.primary_mode !== 'edgeless') throw new Error('invalid-request');
    const derived = deriveManuscriptSnapshot(input.snapshot);
    if (derived.title !== undefined) manuscriptText(derived.title);
    return this.db.transaction(() => {
      const doc = this.activeDocument(input.id);
      const title = derived.title ?? doc.title;
      this.db.prepare('UPDATE manuscript_document SET snapshot=?,plain_text=?,title=?,primary_mode=?,updated_at=? WHERE id=?')
        .run(input.snapshot, derived.plainText, title, input.primary_mode ?? doc.primary_mode, now(), input.id);
      this.db.prepare('DELETE FROM manuscript_link WHERE document_id=?').run(input.id);
      const insert = this.db.prepare('INSERT INTO manuscript_link(document_id,block_id,target_scheme,target_id) VALUES(?,?,?,?)');
      for (const link of derived.links) insert.run(input.id, link.block_id, link.target_scheme, link.target_id);
      this.db.prepare('DELETE FROM manuscript_document_fts WHERE document_id=?').run(input.id);
      // Match migration011's book-content indexing pipeline. Canonical title/plain_text remain exact.
      this.db.prepare('INSERT INTO manuscript_document_fts(document_id,title,plain_text) VALUES(?,?,?)')
        .run(input.id, normalizeArabicText(title), normalizeArabicText(derived.plainText));
      this.touch(doc.manuscript_id);
      return this.document(input.id);
    })();
  }
  history(id: string): ManuscriptVersion[] {
    this.document(id);
    return this.db.prepare("SELECT revision,snapshot_hash,action,created_at,restored_from_revision FROM entity_version WHERE entity_type='manuscript_document' AND entity_id=? ORDER BY revision DESC").all(id) as ManuscriptVersion[];
  }
  checkpoint(id: string, action = 'checkpoint', restoredFrom?: number): boolean {
    return this.db.transaction(() => {
      const doc = this.activeDocument(id);
      const value: VersionContent = { snapshot: doc.snapshot, title: doc.title, primary_mode: doc.primary_mode };
      const content = JSON.stringify(value), hash = createHash('sha256').update(content).digest('hex');
      const last = this.db.prepare("SELECT revision,snapshot_hash FROM entity_version WHERE entity_type='manuscript_document' AND entity_id=? ORDER BY revision DESC LIMIT 1").get(id) as ManuscriptVersion | undefined;
      if (last?.snapshot_hash === hash) return false;
      const time = now();
      this.db.prepare('INSERT OR IGNORE INTO history_blob(hash,content,byte_length,created_at) VALUES(?,?,?,?)').run(hash, content, Buffer.byteLength(content), time);
      this.db.prepare(`INSERT INTO entity_version(id,entity_type,entity_id,revision,snapshot_hash,action,restored_from_revision,schema_version,created_at)
        VALUES(?,'manuscript_document',?,?,?,?,?,1,?)`).run(randomUUID(), id, (last?.revision ?? 0) + 1, hash, action, restoredFrom ?? null, time);
      return true;
    })();
  }
  restoreVersion(id: string, revision: number): ManuscriptDocument {
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('invalid-request');
    return this.db.transaction(() => {
      this.activeDocument(id);
      const row = this.db.prepare(`SELECT b.content FROM entity_version v JOIN history_blob b ON b.hash=v.snapshot_hash
        WHERE v.entity_type='manuscript_document' AND v.entity_id=? AND v.revision=? AND v.schema_version=1`).get(id, revision) as { content: string } | undefined;
      if (!row) throw new Error('invalid-request');
      const value = JSON.parse(row.content) as VersionContent;
      this.checkpoint(id);
      this.db.prepare('UPDATE manuscript_document SET title=? WHERE id=?').run(manuscriptText(value.title), id);
      const result = this.save({ id, snapshot: value.snapshot, primary_mode: value.primary_mode });
      this.checkpoint(id, 'restore', revision);
      return result;
    })();
  }
  search(query: string, manuscriptId?: string): ManuscriptDocument[] {
    if (typeof query !== 'string' || query.length > 1000) throw new Error('invalid-request');
    if (manuscriptId !== undefined) this.manuscript(manuscriptId);
    const words = normalizeArabicText(query).match(/[\p{L}\p{N}\p{M}]+/gu);
    if (!words?.length) return [];
    const match = words.map(word => `"${word}"`).join(' AND ');
    return this.db.prepare(`WITH RECURSIVE visible(id) AS (
      SELECT d.id FROM manuscript_document d JOIN manuscript m ON m.id=d.manuscript_id
      WHERE d.parent_id IS NULL AND d.deleted_at IS NULL AND m.deleted_at IS NULL
      UNION ALL SELECT d.id FROM manuscript_document d JOIN visible p ON p.id=d.parent_id WHERE d.deleted_at IS NULL
    ) SELECT d.* FROM manuscript_document_fts f JOIN manuscript_document d ON d.id=f.document_id JOIN visible v ON v.id=d.id
      WHERE manuscript_document_fts MATCH ? AND (? IS NULL OR d.manuscript_id=?) ORDER BY rank LIMIT 100`).all(match, manuscriptId ?? null, manuscriptId ?? null) as ManuscriptDocument[];
  }
}
