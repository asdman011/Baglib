import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import type { PageNotePayload } from '../../src/shared/types/knowledge';

describe('SqliteKnowledgeRepository', () => {
  let db: Database.Database;
  let repo: SqliteKnowledgeRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteKnowledgeRepository(db);

    // Seed a work so knowledge foreign key is satisfied
    db.prepare(`
      INSERT INTO work (id, work_type_id, title)
      VALUES ('work-note-1', 'wt-book', 'صحيح مسلم')
    `).run();
  });

  describe('Empty and Missing-data Cases', () => {
    it('returns empty array when no notes exist', () => {
      const notes = repo.getAllNotes();
      assert.deepStrictEqual(notes, []);
    });

    it('does not throw when deleting non-existent note', () => {
      assert.doesNotThrow(() => {
        repo.deleteNote('missing-note-id');
      });
    });
  });

  describe('Normal Operations and Mapping', () => {
    it('adds and retrieves typed notes', () => {
      const payload: PageNotePayload = {
        id: 'note-1',
        bookId: 'work-note-1',
        pageNumber: 42,
        content: 'فائدة مهمة في باب النية',
      };

      const created = repo.addNote(payload);
      assert.strictEqual(created.id, 'note-1');
      assert.strictEqual(created.content, 'فائدة مهمة في باب النية');

      const allNotes = repo.getAllNotes();
      assert.strictEqual(allNotes.length, 1);
      const note = allNotes[0];

      assert.strictEqual(note.id, 'note-1');
      assert.strictEqual(note.bookId, 'work-note-1');
      assert.strictEqual(note.pageNumber, 42);
      assert.strictEqual(note.content, 'فائدة مهمة في باب النية');
      assert.ok(note.createdAt);
    });

    it('deletes a note and cascades from knowledge to note_detail', () => {
      repo.addNote({
        id: 'note-del-1',
        bookId: 'work-note-1',
        pageNumber: 15,
        content: 'ملاحظة مؤقتة',
      });

      assert.strictEqual(repo.getAllNotes().length, 1);

      repo.deleteNote('note-del-1');
      assert.strictEqual(repo.getAllNotes().length, 0);

      // Verify cascade in SQLite detail table
      const details = db.prepare('SELECT * FROM note_detail WHERE knowledge_id = ?').all('note-del-1');
      assert.strictEqual(details.length, 0);
    });
  });
});
