/**
 * KEY-398 book revision: book and category decks, AI questions from highlights and comments
 * (mocked AI; nothing saved before the user accepts), and the "time to revise" trigger.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { DeckSyncService } from '../../src/main/services/deck-sync';
import { BookRevisionService, finishesBook } from '../../src/main/services/book-revision';
import { parseBookQuestions, validateAcceptQuestions, validateGenerateQuestions, type BookQuestionSource } from '../../src/shared/book-questions';

function fixture() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  db.prepare(`INSERT INTO category (id, name_ar, name_en) VALUES ('c1', 'التاريخ', 'History')`).run();
  db.prepare(`INSERT INTO work (id, title, primary_category_id) VALUES ('w1', 'مقدمة ابن خلدون', 'c1')`).run();
  db.prepare(`INSERT INTO work (id, title, primary_category_id) VALUES ('w2', 'The Histories', 'c1')`).run();
  const ann = db.prepare(
    `INSERT INTO annotations (id, book_id, type, location_cfi_or_page, selected_text, note_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '2026-11-18', '2026-11-18')`
  );
  ann.run('a1', 'w1', 'highlight', '12', 'العَصَبِيَّةُ إنما تكون من الالتحام بالنسب', null);
  ann.run('a2', 'w1', 'note', '40', 'الظلم مؤذن بخراب العمران', 'فكرة مركزية في الكتاب');
  ann.run('a3', 'w2', 'highlight', 'epubcfi(/6/4)', 'Herodotus of Halicarnassus here displays his enquiry', null);
  const clock = () => new Date('2026-11-18T09:00:00.000Z');
  const sync = new DeckSyncService(db, clock);
  return { db, service: new BookRevisionService(db, sync) };
}
const count = (db: Database.Database, sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;

test('AI output: only questions about given annotations, well formed, are kept', () => {
  const sources: BookQuestionSource[] = [
    { label: 'A1', annotationId: 'a1', quote: 'q1', note: '', page: 12 },
    { label: 'A2', annotationId: 'a2', quote: 'q2', note: 'n', page: null },
  ];
  const raw = JSON.stringify({
    questions: [
      { source: 'A1', kind: 'qa', question: 'ما العصبية؟', answer: 'الالتحام بالنسب' },
      { source: 'A9', kind: 'qa', question: 'invented source', answer: 'x' },
      { source: 'A2', kind: 'choice', question: 'Q?', answer: 'B', options: ['A', 'B', 'C'], correct: 1 },
      { source: 'A2', kind: 'choice', question: 'bad index', answer: 'x', options: ['A', 'B', 'C'], correct: 3 },
      { source: 'A2', kind: 'choice', question: 'too few', answer: 'x', options: ['A', 'B'], correct: 0 },
      { source: 'A1', kind: 'qa', question: 'ما العصبية؟', answer: 'duplicate' },
      { source: 'A1', kind: 'essay', question: 'wrong kind', answer: 'x' },
    ],
  });
  const out = parseBookQuestions(raw, sources, ['qa', 'choice']);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { annotationId: 'a1', kind: 'qa', question: 'ما العصبية؟', answer: 'الالتحام بالنسب', quote: 'q1', page: 12 });
  assert.equal(out[1].correctIndex, 1);
  assert.equal(parseBookQuestions(raw, sources, ['qa']).length, 1, 'kinds not asked for are dropped');
  assert.equal(parseBookQuestions('```json\n{"questions":[]}\n```', sources, ['qa']).length, 0, 'a fenced JSON reply is read');
  assert.throws(() => parseBookQuestions('not json', sources, ['qa']), /invalid-output/u);
});

test('book deck: follows highlights and comments; asking again reuses it', async () => {
  const f = fixture();
  try {
    const first = await f.service.bookDeck('w1');
    assert.equal(first.created, true);
    assert.equal(first.added, 2, 'one highlight card and one comment card');
    const again = await f.service.bookDeck('w1');
    assert.equal(again.deckId, first.deckId);
    assert.equal(again.created, false);
    assert.equal(count(f.db, `SELECT COUNT(*) AS n FROM deck_subscription WHERE deck_id = ?`, first.deckId), 2);
    await assert.rejects(f.service.bookDeck('nope'), /source-not-found/u);
  } finally {
    f.db.close();
  }
});

test('category deck: one deck with a sub-deck per book', async () => {
  const f = fixture();
  try {
    const r = await f.service.categoryDeck('c1', 'en');
    assert.equal(r.books, 2);
    const names = (f.db.prepare(`SELECT d.name, p.name AS parent FROM deck d LEFT JOIN deck p ON p.id = d.parent_id ORDER BY d.name`).all() as Array<{ name: string; parent: string | null }>).filter(d => d.parent === 'History');
    assert.deepEqual(names.map(n => n.name).sort(), ['The Histories', 'مقدمة ابن خلدون']);
    {
      const root = f.db.prepare(`SELECT name FROM deck WHERE id = ?`).get(r.deckId) as { name: string };
      assert.equal(root.name, 'History');
    }
    assert.equal((await f.service.categoryDeck('c1', 'ar')).deckId !== r.deckId, true, 'the Arabic name makes its own deck');
    f.db.prepare(`INSERT INTO category (id, name_ar, name_en) VALUES ('c2', 'فارغ', 'Empty')`).run();
    await assert.rejects(f.service.categoryDeck('c2', 'en'), /no-books/u);
  } finally {
    f.db.close();
  }
});

test('AI questions: nothing saved until accepted; accepted ones quote the book verbatim with the page', async () => {
  const f = fixture();
  try {
    let seen = '';
    const notesBefore = count(f.db, `SELECT COUNT(*) AS n FROM card_note`);
    const { suggestions, sources } = await f.service.generate('w1', 'ar', ['qa', 'choice'], async (system, user) => {
      seen = user;
      assert.match(system, /Arabic/u);
      return JSON.stringify({
        questions: [
          { source: 'A1', kind: 'qa', question: 'ممَّ تكون العصبية؟', answer: 'من الالتحام بالنسب', quote: 'FABRICATED' },
          { source: 'A2', kind: 'choice', question: 'ما الذي يؤذن بخراب العمران؟', answer: 'الظلم', options: ['العدل', 'الظلم', 'الترف'], correct: 1 },
        ],
      });
    });
    assert.equal(sources, 2);
    assert.ok(seen.includes('العَصَبِيَّةُ إنما تكون من الالتحام بالنسب') && seen.includes('فكرة مركزية في الكتاب'), 'the highlights and comments are sent');
    assert.equal(suggestions.length, 2);
    assert.equal(suggestions[0].quote, 'العَصَبِيَّةُ إنما تكون من الالتحام بالنسب', 'the quote comes from the database, not the AI');
    assert.equal(count(f.db, `SELECT COUNT(*) AS n FROM card_note`), notesBefore, 'suggestions are not saved');

    // The user accepts both (the renderer sends what it showed, but the quote is re-read here).
    const accepted = validateAcceptQuestions({
      workId: 'w1',
      language: 'ar',
      questions: suggestions.map(s => ({ annotationId: s.annotationId, kind: s.kind, question: s.question, answer: s.answer, options: s.options, correctIndex: s.correctIndex })),
    });
    const r = await f.service.accept('w1', 'ar', accepted.questions, null);
    assert.equal(r.added, 2);
    assert.equal(r.deckId, f.service.findBookDeck('w1'), 'goes into the book’s deck (made if needed)');

    const qa = f.db.prepare(`SELECT n.fields_json FROM card_note n WHERE n.source_ref LIKE 'ai-question:w1/a1/%'`).get() as { fields_json: string };
    const back = JSON.parse(qa.fields_json).Back as string;
    assert.ok(back.includes('العَصَبِيَّةُ إنما تكون من الالتحام بالنسب'), 'verbatim quote');
    assert.ok(back.includes('ص 12'), 'with its page');
    assert.ok(back.includes('مولَّد بالذكاء الاصطناعي'), 'labelled as AI-generated');
    assert.ok(!back.includes('FABRICATED'));

    const choice = f.db.prepare(`SELECT c.question_kind, c.payload_json FROM card_detail c JOIN card_note n ON n.id = c.note_id WHERE n.source_ref LIKE 'ai-question:w1/a2/%'`).get() as { question_kind: string; payload_json: string };
    assert.equal(choice.question_kind, 'choice');
    assert.deepEqual(JSON.parse(choice.payload_json), { options: ['العدل', 'الظلم', 'الترف'], correctIndex: 1 });
    assert.equal(count(f.db, `SELECT COUNT(*) AS n FROM knowledge_tag kt JOIN tag t ON t.id = kt.tag_id WHERE t.name = 'ai-generated'`) >= 2, true);

    assert.equal(f.service.questionSources('w1').length, 0, 'annotations with accepted questions are not offered again');
    await assert.rejects(f.service.generate('w1', 'ar', ['qa'], async () => '{}'), /no-annotations/u);
    await assert.rejects(f.service.accept('w1', 'ar', [{ annotationId: 'a3', kind: 'qa', question: 'q', answer: 'a' }], null), /invalid-request/u, 'an annotation of another book is refused');
  } finally {
    f.db.close();
  }
});

test('finishing a book triggers the prompt once; requests are validated', () => {
  assert.equal(finishesBook('reading', 'completed'), true);
  assert.equal(finishesBook(null, 'completed'), true);
  assert.equal(finishesBook('completed', 'completed'), false, 'already finished');
  assert.equal(finishesBook('completed', 'reading'), false);
  assert.throws(() => validateGenerateQuestions({ workId: 'w1', extra: 1 }), /invalid-request/u);
  assert.throws(() => validateGenerateQuestions({ workId: '../x' }), /invalid-request/u);
  assert.throws(() => validateGenerateQuestions({ workId: 'w1', kinds: ['essay'] }), /invalid-request/u);
  assert.deepEqual(validateGenerateQuestions({ workId: 'w1' }), { workId: 'w1', language: 'en', allowRemote: false, kinds: ['qa'] });
  assert.throws(() => validateAcceptQuestions({ workId: 'w1', questions: [] }), /invalid-request/u);
  assert.throws(() => validateAcceptQuestions({ workId: 'w1', questions: [{ annotationId: 'a1', kind: 'choice', question: 'q', answer: 'a', options: ['x', 'y'], correctIndex: 2 }] }), /invalid-request/u);
});
