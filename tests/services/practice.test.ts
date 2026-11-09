import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { PracticeService } from '../../src/main/services/practice';
import { checkAnswer, validateQuestion, checkMethodKey } from '../../src/shared/practice';
const fixture = () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys=ON');
    runMigrations(db, migrations);
    return { db, cards: new KnowledgeCardRepository(db), practice: new PracticeService(db) };
};
test('kind checking distinguishes automatic evidence from learner ratings', () => {
    assert.equal(checkAnswer('choice', { options: ['أ', 'B'], correctIndex: 1 }, '1'), 'correct');
    assert.equal(checkAnswer('choice', { options: ['أ', 'B'], correctIndex: 1 }, '0'), 'incorrect');
    assert.equal(checkAnswer('numeric', { answer: 0.3, tolerance: 0.1, unit: 'm' }, '0.2'), 'correct');
    assert.equal(checkAnswer('numeric', { answer: 0.3, tolerance: 0.1, unit: 'm' }, '0.4'), 'correct');
    assert.equal(checkAnswer('numeric', { answer: 0.3, tolerance: 0.1, unit: 'm' }, '0.4001'), 'incorrect');
    assert.equal(checkAnswer('numeric', { answer: 4, tolerance: 0, unit: '' }, '٤'), 'correct');
    for (const kind of ['recall', 'short', 'application', 'explain_back'] as const)
        assert.equal(checkAnswer(kind, null, 'answer'), 'pending');
    assert.deepEqual(['auto', 'self', 'judgment'].map(checkMethodKey), ['practiceCheckedAuto', 'practiceCheckedSelf', 'practiceCheckedJudgment']);
});
test('payload validation rejects malformed and unbounded data', () => {
    for (const [kind, payload] of [['bad', null], ['choice', { options: ['one'], correctIndex: 0 }], ['choice', { options: ['a', 'b'], correctIndex: 2 }], ['numeric', { answer: Infinity, tolerance: 0, unit: '' }], ['numeric', { answer: 1, tolerance: -1, unit: '' }], ['short', { modelAnswer: 'x'.repeat(20001) }]])
        assert.throws(() => validateQuestion(kind, payload), /invalid-request/);
});
test('attempts are server checked, revision pinned and retained through deletion', () => {
    const { db, cards, practice } = fixture();
    try {
        const card = cards.save({ front: 'mixed علم', back: '', sourceKind: 'book', sourceRef: 'book:w@s#p=1', questionKind: 'choice', payload: { options: ['أ', 'B'], correctIndex: 1 } });
        const attempt = practice.record({ knowledgeId: card.id, cardRevision: card.cardRevision, answerText: '1', confidence: 3, durationMs: 10 });
        assert.equal(attempt.answerText, 'B');
        assert.equal(attempt.result, 'correct');
        assert.equal(attempt.checkMethod, 'auto');
        assert.equal(attempt.sourceRef, 'book:w@s#p=1');
        assert.equal(attempt.cardRevision, card.cardRevision);
        cards.remove(card.id);
        assert.equal(practice.list({ knowledgeId: card.id })[0].deleted, true);
        db.prepare('DELETE FROM knowledge WHERE id=?').run(card.id);
        assert.equal(practice.list({ sourceRef: 'book:w@s#p=1' }).length, 1);
    }
    finally {
        db.close();
    }
});
test('pending answers can be judged only once and clear requires explicit confirmation', () => {
    const { db, cards, practice } = fixture();
    try {
        const card = cards.save({ front: 'why', back: 'model', sourceKind: 'note', questionKind: 'short', payload: { modelAnswer: 'model' } });
        const a = practice.record({ knowledgeId: card.id, cardRevision: card.cardRevision, answerText: 'my exact answer', confidence: 2, checkMethod: 'judgment' });
        assert.equal(a.result, 'pending');
        assert.equal(practice.judge({ id: a.id, result: 'incorrect', mistakeCategory: 'assumption' }).result, 'incorrect');
        assert.throws(() => practice.judge({ id: a.id, result: 'correct' }), /attempt-changed/);
        assert.throws(() => practice.clear(false), /invalid-request/);
        assert.equal(practice.list({}).length, 1);
        practice.clear(true);
        assert.equal(practice.list({}).length, 0);
    }
    finally {
        db.close();
    }
});
test('main-process service rejects enum, bound, forged-result and stale-revision inputs', () => {
    const { db, cards, practice } = fixture();
    try {
        const c = cards.save({ front: 'q', back: 'a', sourceKind: 'note' });
        const base = { knowledgeId: c.id, cardRevision: c.cardRevision, answerText: 'a', confidence: 1, checkMethod: 'self', result: 'correct' };
        for (const extra of [{ confidence: 0 }, { confidence: 5 }, { confidence: 1.1 }, { durationMs: -1 }, { durationMs: Infinity }, { result: 'bad' }, { checkMethod: 'auto' }, { checkMethod: 'bad' }, { context: 'bad' }, { mistakeCategory: 'bad' }, { mistakeCategory: 'recall' }, { cardRevision: 999 }, { answerText: 'a'.repeat(20001) }])
            assert.throws(() => practice.record({ ...base, ...extra }));
    }
    finally {
        db.close();
    }
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import migration026 from '../../src/main/database/migrations/026_practice_attempts';
import { KnowledgeHistoryService, headRevision, withKnowledgeHistory } from '../../src/main/services/knowledge-history';
test('026 up/down on populated backup preserves old cards, snapshots, indexes and schedules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-026-'));
    const original = new Database(path.join(dir, 'populated.db'));
    let db: Database.Database | undefined;
    try {
        original.pragma('foreign_keys=ON');
        runMigrations(original, migrations.filter(m => m.id < 26));
        original.exec("INSERT INTO knowledge(id,knowledge_type) VALUES('legacy','card'); INSERT INTO card_detail(knowledge_id,front,back,source_kind) VALUES('legacy','عِلْمٌ — Original','old','note'); INSERT INTO srs_state(knowledge_id,state,due_at,reps) VALUES('legacy','review','2026-01-01',9)");
        withKnowledgeHistory(original, ['legacy'], 'edit', () => original.exec("UPDATE card_detail SET back='new' WHERE knowledge_id='legacy'"));
        const before = original.prepare('SELECT * FROM card_detail').get();
        original.close();
        fs.copyFileSync(path.join(dir, 'populated.db'), path.join(dir, 'copy.db'));
        db = new Database(path.join(dir, 'copy.db'));
        db.pragma('foreign_keys=ON');
        db.transaction(() => migration026.up(db!))();
        assert.deepEqual(db.prepare('SELECT * FROM card_detail').get(), { ...before, question_kind: 'recall', payload_json: null });
        const repo = new KnowledgeCardRepository(db);
        const current = repo.list()[0];
        repo.update(current.id, { front: 'Changed', back: '', sourceKind: 'note', questionKind: 'numeric', payload: { answer: 5, tolerance: 0, unit: 'm' } }, current.cardRevision!);
        new KnowledgeHistoryService(db).restore('legacy', 1, headRevision(db, 'legacy'));
        assert.equal(repo.list()[0].front, 'عِلْمٌ — Original');
        assert.equal(repo.list()[0].questionKind, 'recall');
        assert.equal(repo.list()[0].payload, null);
        assert.equal((db.prepare('SELECT reps FROM srs_state').get() as {
            reps: number;
        }).reps, 9);
        assert.equal((db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name LIKE 'idx_practice_attempt_%'").get() as {
            n: number;
        }).n, 3);
        db.transaction(() => migration026.down!(db!))();
        assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='idx_card_detail_source'").get());
        assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
        assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
        migration026.up(db);
        assert.equal(repo.list()[0].questionKind, 'recall');
    }
    finally {
        if (original.open)
            original.close();
        db?.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
test('card snapshots restore kind/payload while attempts stay pinned', () => {
    const { db, cards, practice } = fixture();
    try {
        const c = cards.save({ front: 'q', back: '', sourceKind: 'note', questionKind: 'numeric', payload: { answer: 2, tolerance: 0, unit: 'm' } });
        const a = practice.record({ knowledgeId: c.id, cardRevision: c.cardRevision, answerText: '2', confidence: 4 });
        cards.update(c.id, { front: 'changed', back: '', sourceKind: 'note', questionKind: 'short', payload: { modelAnswer: 'a' } }, c.cardRevision!);
        new KnowledgeHistoryService(db).restore(c.id, c.cardRevision!, headRevision(db, c.id));
        assert.equal(cards.list()[0].questionKind, 'numeric');
        assert.deepEqual(cards.list()[0].payload, { answer: 2, tolerance: 0, unit: 'm' });
        assert.equal(practice.list({})[0].cardRevision, a.cardRevision);
    }
    finally {
        db.close();
    }
});
test('every manual kind separates self ratings from pending judgment', () => {
    const { db, cards, practice } = fixture();
    try {
        for (const kind of ['recall', 'short', 'application', 'explain_back'] as const) {
            const c = cards.save({ front: kind, back: '', sourceKind: 'note', questionKind: kind, payload: kind === 'recall' ? null : { modelAnswer: 'model' } });
            const input = { knowledgeId: c.id, cardRevision: c.cardRevision, answerText: 'exact عِلْمٌ', confidence: 1 };
            assert.equal(practice.record({ ...input, checkMethod: 'self', result: 'partial', mistakeCategory: 'method' }).checkMethod, 'self');
            assert.equal(practice.record({ ...input, checkMethod: 'judgment' }).result, 'pending');
        }
    }
    finally {
        db.close();
    }
});
import { translations } from '../../src/renderer/translations';
test('check-method and outcome labels are present in both languages without encoding loss', () => {
    for (const lang of ['ar', 'en'] as const)
        for (const method of ['auto', 'self', 'judgment'] as const) {
            const label = translations[lang][checkMethodKey(method)];
            assert.ok(label.length > 3);
            assert.ok(!label.includes('?'));
            if (lang === 'ar')
                assert.match(label, /[\u0621-\u064a]/u);
        }
});
test('numeric boundary checks do not widen a small tolerance for large answers', () => {
    assert.equal(checkAnswer('numeric', { answer: 1e14, tolerance: 0.001, unit: '' }, '100000000000000.02'), 'incorrect');
    assert.equal(checkAnswer('numeric', { answer: -4, tolerance: 0, unit: '' }, '-٤'), 'correct');
    for (const a of ['', '1,2', 'Infinity', 'NaN', '2m', '0x10'])
        assert.throws(() => checkAnswer('numeric', { answer: 2, tolerance: 0, unit: 'm' }, a), /invalid-request/);
});
test('work deletion retains attempts; direct SQL constraints reject invalid stored evidence', () => {
    const { db, cards, practice } = fixture();
    try {
        db.exec("INSERT INTO work(id,title) VALUES('w','Book')");
        const c = cards.save({ front: 'q', back: '', sourceKind: 'book', workId: 'w', sourceRef: 'book:w@s#p=2' });
        const a = practice.record({ knowledgeId: c.id, cardRevision: c.cardRevision, answerText: 'exact', confidence: 2, checkMethod: 'self', result: 'incorrect', mistakeCategory: 'recall' });
        db.exec("DELETE FROM work WHERE id='w'");
        assert.equal(practice.list({})[0].id, a.id);
        for (const [column, value] of [['question_kind', 'bad'], ['result', 'bad'], ['check_method', 'bad'], ['mistake_category', 'bad'], ['context', 'bad'], ['confidence', 5], ['duration_ms', -1]])
            assert.throws(() => db.prepare(`UPDATE practice_attempt SET ${column}=? WHERE id=?`).run(value, a.id), /CHECK/);
        for (const q of [{ sourceRef: 'book:w#p=1' }, { offset: -1 }, { offset: 0.5 }, { knowledgeId: '' }])
            assert.throws(() => practice.list(q), /invalid-request/);
    }
    finally {
        db.close();
    }
});

import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
test('active book-scoped practice cards stay out of both reader annotation queries',()=>{
 const {db,cards}=fixture();try{
  db.exec("INSERT INTO work(id,title) VALUES('reader-book','Book')");
  cards.save({front:'Active question',back:'',sourceKind:'book',workId:'reader-book',sourceRef:'book:reader-book@s#p=2',questionKind:'short',payload:{modelAnswer:'model'}});
  const repository=new SqliteKnowledgeRepository(db);
  assert.equal(repository.getKnowledgeByWork('reader-book').length,0);
  assert.equal(repository.getAllKnowledge().length,0);
  repository.saveKnowledge({workId:'reader-book',knowledgeType:'highlight',location:'2',quotedText:'real passage'});
  assert.equal(repository.getKnowledgeByWork('reader-book').length,1);
 }finally{db.close();}
});
