import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { markUnsourcedStatements, splitCitedTextParts, CITED_ANSWER_RULING_POLICY } from '../../src/shared/cited-answer';
import { validatePdfAnswer } from '../../src/main/services/pdf-editor/cited-answer';
import { assistantSystemPrompt, validateAssistantAnswer, type AssistantSource } from '../../src/shared/study-assistant';
import { runAssistantChat } from '../../src/main/services/ai/assistant-chat';
import { runResearchEditorAi } from '../../src/main/services/ai/research-editor-ai';
import { AIResearchService } from '../../src/main/services/ai/ai-research.service';
import { AIProviderService } from '../../src/main/services/ai/ai-provider.service';
import { ContentFtsRepository } from '../../src/main/database/repositories/content-fts.repository';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { insertBlockIntoManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';
import { emptySourceProps } from '../../src/shared/research-editor-sources';
import type { AISettings } from '../../src/shared/types/ai';

test('KEY-438: validatePdfAnswer reuses shared cited-answer validation', () => {
  const inspection = {
    sourceId: 's1',
    filePath: '/tmp/a.pdf',
    pageCount: 1,
    extraction: 'ok' as const,
    pages: [{ page: 1, text: 'الصبر ضياء واليقين نور.', charCount: 23 }],
  };
  const valid = validatePdfAnswer(
    JSON.stringify({ answer: 'الصبر ضياء', abstained: false, citations: [{ page: 1, quote: 'الصبر ضياء' }] }),
    inspection,
  );
  assert.equal(valid.citations.length, 1);
  assert.throws(() => validatePdfAnswer(JSON.stringify({ answer: 'x', abstained: false, citations: [] }), inspection), /invalid-output/);
});

test('KEY-438: markUnsourcedStatements marks uncited claims in ar and en while preserving cited ones', () => {
  const en = markUnsourcedStatements('First claim [1].\nSecond claim without source.', new Set([1]), 'en');
  assert.equal(en, 'First claim [1].\nSecond claim without source. [unsourced]');

  const ar = markUnsourcedStatements('القول الأول [1]. القول الثاني بلا مصدر.', new Set([1]), 'ar');
  assert.equal(ar, 'القول الأول [1]. القول الثاني بلا مصدر. [غير موثق بمصدر]');

  const parts = splitCitedTextParts('Claim [1] and extra [unsourced]');
  assert.deepEqual(parts, [
    { type: 'text', value: 'Claim ' },
    { type: 'citation', value: '[1]', n: 1 },
    { type: 'text', value: ' and extra ' },
    { type: 'unsourced', value: 'unsourced' },
  ]);
});

test('KEY-438: StudyAssistant prompt enforces ruling policy and marks uncited statements', () => {
  assert.ok(assistantSystemPrompt('qa', 'en').includes(CITED_ANSWER_RULING_POLICY));
  const sources: AssistantSource[] = [
    { id: 'S1', label: 'فوائد', target: 'note:n1', text: 'الصبر ضياء' },
  ];
  const ans = validateAssistantAnswer(
    JSON.stringify({
      answer: 'الصبر ضياء [S1].\nوهذه إضافة من خارج المصدر.',
      abstained: false,
      citations: [{ source: 'S1', quote: 'الصبر ضياء' }],
    }),
    sources,
    'qa',
    false,
    'ar',
  );
  assert.match(ans.answer, /الصبر ضياء \[S1\]\./);
  assert.match(ans.answer, /\[غير موثق بمصدر\]/);
});

test('KEY-438: Global chat and Research Editor AI mark unsourced claims and label translations', async () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);
  try {
    const repo = new ManuscriptRepository(db);
    const ms = repo.create('بحث', 'research');
    const doc = repo.createDocument(ms.id, 'الفصل الأول');
    repo.save({
      id: doc.id,
      snapshot: insertBlockIntoManuscriptSnapshot(repo.document(doc.id).snapshot, 'ayah', {
        ...emptySourceProps(),
        url: 'quran:hafs:2:255',
        label: 'البقرة ٢٥٥',
        text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ',
      }).snapshot,
    });
    const settings = { enabled: true, provider: 'ollama' } as AISettings;

    const chatUnsourced = await runAssistantChat(
      { messages: [{ role: 'user', text: 'ما الحكم؟' }], sources: [], lang: 'en', allowRemote: false },
      {
        db,
        settings,
        resolve: async () => [],
        complete: async (prompt) => {
          assert.ok(prompt.systemPrompt.includes(CITED_ANSWER_RULING_POLICY));
          return 'General statement without a library source.';
        },
      },
    );
    assert.equal(chatUnsourced.ok, true);
    if (chatUnsourced.ok) {
      assert.match(chatUnsourced.text, /\[unsourced\]/);
    }

    const chatTranslate = await runAssistantChat(
      { messages: [], action: 'translate', selection: 'الصبر ضياء', sources: [], lang: 'en', allowRemote: false },
      { db, settings, resolve: async () => [], complete: async () => 'Patience is light.' },
    );
    assert.equal(chatTranslate.ok, true);
    if (chatTranslate.ok) {
      assert.equal(chatTranslate.isTranslation, true);
      assert.doesNotMatch(chatTranslate.text, /\[unsourced\]/);
    }

    const editorUnsourced = await runResearchEditorAi(
      { documentId: doc.id, action: 'ask', question: 'explain', lang: 'en' },
      { db, settings, complete: async () => 'Cited point [1].\nUncited point.' },
    );
    assert.equal(editorUnsourced.ok, true);
    if (editorUnsourced.ok) {
      assert.match(editorUnsourced.text, /Uncited point\. \[unsourced\]/);
    }
  } finally {
    db.close();
  }
});

test('KEY-438: Reader drawer reuses cited-answer policy and labels translations', async () => {
  const db = createTestDatabase();
  const fts = new ContentFtsRepository(db);
  const service = new AIResearchService(db);
  db.exec(`
    INSERT OR IGNORE INTO work_type (id, name, icon) VALUES ('wt-book', 'كتاب', 'book');
    INSERT INTO work (id, work_type_id, title) VALUES ('work-438', 'wt-book', 'كتاب الاختبار');
  `);
  fts.indexBook('work-438', [{ pageNumber: 1, locationCfiOrPage: '1', content: 'طلب العلم فريضة.' }]);

  const original = AIProviderService.getInstance().generateChatCompletion;
  AIProviderService.getInstance().generateChatCompletion = async (req) => {
    assert.ok(req.systemPrompt.includes(CITED_ANSWER_RULING_POLICY));
    return 'البيان الموثق [1].\nكلام إضافي.';
  };
  try {
    const res = await service.executeTool({
      bookId: 'work-438',
      bookTitle: 'كتاب الاختبار',
      currentPage: 1,
      tool: 'chat',
      userQuery: 'ما الفائدة؟',
    });
    assert.equal(res.citations?.length, 1);
    assert.match(res.content, /\[غير موثق بمصدر\]/);
  } finally {
    AIProviderService.getInstance().generateChatCompletion = original;
    db.close();
  }
});

test('KEY-438: AI-generated cards keep ai-generated tag and stay out of revision until accepted into memorization', () => {
  const db = createTestDatabase();
  try {
    const repo = new KnowledgeCardRepository(db);
    const card = repo.save({
      front: 'ما الصبر؟',
      back: 'نص مولّد بالذكاء الاصطناعي\n\nحبس النفس',
      sourceKind: 'note',
      sourceRef: 'note:n1',
      sourceLabel: 'فوائد',
      tags: ['ai-generated'],
    });
    assert.equal(card.memorizing, false, 'AI-made card must not enter revision automatically');
    assert.equal(card.aiGenerated, true, 'AI-made card retains ai-generated tag');
    const listed = repo.list({ search: 'الصبر' });
    assert.equal(listed[0]?.aiGenerated, true);
  } finally {
    db.close();
  }
});
