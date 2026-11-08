import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { MarkHistoryService } from '../../src/main/services/mark-history';
import { saveReaderKnowledge } from '../../src/renderer/libs/reader/save-reader-knowledge';

test('reader saves one canonical row/projection/history action and preserves existing notes', async () => {
  const db = createTestDatabase();
  try {
    db.prepare("INSERT INTO work(id,work_type_id,title) VALUES('reader-work','wt-book','Fixture')").run();
    const repository = new SqliteKnowledgeRepository(db);
    repository.saveKnowledge({ id: 'legacy-note', workId: 'reader-work', knowledgeType: 'note', location: '1', noteContent: 'Keep this existing note' });
    let calls = 0;
    const api = { save: async (payload: Parameters<typeof repository.saveKnowledge>[0]) => { calls++; return repository.saveKnowledge(payload); } };
    const quotedText = 'عِلْمٌ ونَصٌّ English';
    const saved = await saveReaderKnowledge(api, { workId: 'reader-work', knowledgeType: 'highlight', location: JSON.stringify({ page: 1, rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.1 }] }), quotedText, color: 'amber' });
    assert.equal(calls, 1);
    assert.equal(saved.item.quotedText, quotedText);
    assert.equal(saved.annotation?.id, saved.item.id);
    assert.equal(saved.annotation?.selectedText, quotedText);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM knowledge').get() as { count: number }).count, 2);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM annotations WHERE id=?').get(saved.item.id) as { count: number }).count, 1);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM entity_version WHERE entity_id=?').get(saved.item.id) as { count: number }).count, 1);
    assert.equal(repository.getAllNotes().length, 1);
    await saveReaderKnowledge(api, { workId: 'reader-work', knowledgeType: 'note', location: '1', noteContent: 'An explicit note' });
    assert.equal(repository.getAllNotes().length, 2);
    await assert.rejects(saveReaderKnowledge(api, { workId: 'missing', knowledgeType: 'note', location: '1', noteContent: 'Do not partially save' }));
    assert.equal(repository.getAllNotes().length, 2);
    assert.equal(repository.getAllNotes().find(note => note.id === 'legacy-note')?.content, 'Keep this existing note');
    await assert.rejects(saveReaderKnowledge(undefined, { workId: 'reader-work', location: '1' }), /unavailable/u);
  } finally { db.close(); }
});

test('undo follows append order for equal-time actions and redo is scoped to the material', () => {
  const db = createTestDatabase();
  try {
    db.prepare("INSERT INTO work(id,work_type_id,title) VALUES('first','wt-book','First'),('second','wt-book','Second')").run();
    const repository = new SqliteKnowledgeRepository(db);
    const redo = new Map<string, string[]>();
    const history = () => new MarkHistoryService(db, { redoStack: work => redo.get(work) || [], setRedoStack: (work, stack) => { redo.set(work, stack); } });
    const save = (id: string, workId = 'first') => repository.saveKnowledge({ id, workId, knowledgeType: 'note', location: '1', noteContent: id });
    const tie = () => db.prepare("UPDATE entity_version SET created_at='2026-11-07T00:00:00.000Z'").run();
    save('older'); save('newer'); tie();
    history().undo('first');
    assert.deepEqual(repository.getKnowledgeByWork('first').map(item => item.id), ['older']);
    history().undo('first');
    assert.equal(repository.getKnowledgeByWork('first').length, 0);
    history().redo('first'); history().redo('first');
    assert.equal(repository.getKnowledgeByWork('first').length, 2);
    history().undo('first');
    save('fork');
    save('unrelated', 'second'); history().undo('second'); tie();
    assert.throws(() => history().redo('first'), /nothing-to-redo/u);
    assert.deepEqual(redo.get('first'), []);
    assert.equal(repository.getKnowledgeByWork('first').length, 2);
  } finally { db.close(); }
});
