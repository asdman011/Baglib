import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  buildExplainBackPrompt,
  formatExplainBackNote,
  isQuoteInSources,
  parseExplainBackResponse,
  validateExplainBackRequest,
  type ExplainBackSourceItem,
} from '../../src/shared/ai-explain-back';
import { ExplainBackCheckService } from '../../src/main/services/ai/explain-back.service';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { translations } from '../../src/renderer/translations';
import type { AISettings } from '../../src/shared/types/ai';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  return db;
}

const LOCAL_OLLAMA_SETTINGS: AISettings = {
  enabled: true,
  provider: 'ollama',
  ollamaEndpoint: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.2',
  antiSpoilerCeiling: true,
  translationProvider: 'llm',
  targetLanguage: 'ar',
};

const REMOTE_OPENAI_SETTINGS: AISettings = {
  enabled: true,
  provider: 'openai',
  apiKey: 'sk-test-key',
  model: 'gpt-4o-mini',
  antiSpoilerCeiling: true,
  translationProvider: 'llm',
  targetLanguage: 'en',
};

test('validateExplainBackRequest validates required fields and bounds', () => {
  const valid = validateExplainBackRequest({
    kind: 'ayah',
    target: 'quran:hafs:1:1',
    label: 'Al-Fatihah 1:1',
    explanation: 'In the name of Allah, the Most Gracious, the Most Merciful.',
    language: 'en',
    allowRemote: false,
  });
  assert.equal(valid.kind, 'ayah');
  assert.equal(valid.target, 'quran:hafs:1:1');

  assert.throws(() => validateExplainBackRequest({ kind: 'invalid', target: 'x', label: 'x', explanation: 'hi', language: 'en', allowRemote: false }));
  assert.throws(() => validateExplainBackRequest({ kind: 'ayah', target: 'quran:hafs:1:1', label: 'x', explanation: '   ', language: 'en', allowRemote: false }));
  assert.throws(() => validateExplainBackRequest({ kind: 'ayah', target: '', label: 'x', explanation: 'ok', language: 'en', allowRemote: false }));
});

test('buildExplainBackPrompt includes source text, library tafsir/sharh, and anti-rewrite rules', () => {
  const sources: ExplainBackSourceItem[] = [
    { id: 'S1', kind: 'source', title: '1:2', text: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ' },
    { id: 'S2', kind: 'tafsir', title: 'التفسير الميسر', text: 'الثناء على الله بصفاته التي كلها أوصاف كمال، وبنعمه الظاهرة والباطنة.' },
  ];
  const prompt = buildExplainBackPrompt({
    kind: 'ayah',
    label: 'الفاتحة ٢',
    explanation: 'يعني شكر الله على نعمه.',
    sources,
    language: 'ar',
  });

  assert.match(prompt.systemPrompt, /NEVER rewrite/i);
  assert.match(prompt.systemPrompt, /Arabic/);
  assert.doesNotMatch(prompt.systemPrompt, /No library tafsir or sharh was available/);
  assert.match(prompt.userPrompt, /التفسير الميسر/);
  assert.match(prompt.userPrompt, /يعني شكر الله على نعمه/);

  const noCommentaryPrompt = buildExplainBackPrompt({
    kind: 'passage',
    label: 'Book p. 5',
    explanation: 'The author argues for clarity.',
    sources: [{ id: 'S1', kind: 'source', title: 'Book p. 5', text: 'Clarity is essential in scholarly writing.' }],
    language: 'en',
  });
  assert.match(noCommentaryPrompt.systemPrompt, /No library tafsir or sharh was available/);
  assert.match(noCommentaryPrompt.systemPrompt, /English/);
});

test('parseExplainBackResponse parses fenced JSON and verifies quotes with Arabic diacritic tolerance', () => {
  const sources: ExplainBackSourceItem[] = [
    { id: 'S1', kind: 'source', title: 'البخاري ١', text: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى' },
    { id: 'S2', kind: 'sharh', title: 'فتح الباري', text: 'المراد بالأعمال الأعمال الشرعية التي تفتقر إلى النية.' },
  ];

  const raw = [
    '```json',
    JSON.stringify({
      right: ['أشرت إلى أهمية النية في قبول العمل.'],
      missingOrWrong: [
        {
          point: 'فاتك التنبيه على أن المقصود الأعمال الشرعية المفتقرة إلى النية.',
          quote: 'المراد بالأعمال الأعمال الشرعية التي تفتقر إلى النية',
          sourceTitle: 'فتح الباري',
        },
        {
          point: 'نقطة باقتباس مخترع',
          quote: 'هذا النص غير موجود في المصادر إطلاقا',
          sourceTitle: 'فتح الباري',
        },
      ],
      followUpQuestion: 'ما الفرق بين النية في العبادات والعادات؟',
    }),
    '```',
  ].join('\n');

  const parsed = parseExplainBackResponse(raw, sources, 'ollama');
  assert.equal(parsed.right.length, 1);
  assert.equal(parsed.missingOrWrong.length, 2);
  assert.equal(parsed.missingOrWrong[0].quoteVerified, true);
  assert.equal(parsed.missingOrWrong[1].quoteVerified, false);
  assert.equal(parsed.followUpQuestion, 'ما الفرق بين النية في العبادات والعادات؟');
  assert.equal(parsed.sourcesUsed.length, 2);
  assert.equal(isQuoteInSources('انما الاعمال بالنيات', sources), true);
});

test('parseExplainBackResponse rejects invalid JSON or missing follow-up question', () => {
  const sources: ExplainBackSourceItem[] = [{ id: 'S1', kind: 'source', title: '1:1', text: 'Text' }];
  assert.throws(() => parseExplainBackResponse('not json', sources, 'ollama'), /invalid-output/);
  assert.throws(
    () => parseExplainBackResponse(JSON.stringify({ right: [], missingOrWrong: [], followUpQuestion: '' }), sources, 'ollama'),
    /invalid-output/,
  );
});

test('formatExplainBackNote preserves user explanation verbatim and marks AI feedback as generated', () => {
  const t = translations.en;
  const userText = 'My exact words without any AI rewriting.';
  const note = formatExplainBackNote({
    target: 'quran:hafs:1:2',
    label: 'Al-Fatihah 1:2',
    explanation: userText,
    feedback: {
      right: ['Mentioned praise of Allah.'],
      missingOrWrong: [
        {
          point: 'Missed Lordship over all worlds.',
          quote: 'رَبِّ الْعَالَمِينَ',
          sourceTitle: '1:2',
          quoteVerified: true,
        },
      ],
      followUpQuestion: 'What does Rabb encompass here?',
      sourcesUsed: [{ title: '1:2', kind: 'source' }],
      providerUsed: 'ollama',
    },
    labels: {
      titlePrefix: t.explainBackNoteTitlePrefix,
      userSection: t.explainBackUserSectionLabel,
      aiSection: t.explainBackAiSectionLabel,
      rightHeading: t.explainBackRightHeading,
      missingHeading: t.explainBackMissingHeading,
      followUpHeading: t.explainBackFollowUpHeading,
      uncertaintyHeading: t.explainBackUncertaintyHeading,
      noneRecorded: t.explainBackNoneRecorded,
    },
  });

  assert.ok(note.content.includes('[[quran:hafs:1:2|Al-Fatihah 1:2]]'));
  assert.ok(note.content.includes(t.explainBackUserSectionLabel));
  assert.ok(note.content.includes(userText));
  assert.ok(note.content.includes(t.explainBackAiSectionLabel));
  assert.ok(note.content.includes('Auto-generated'));
  assert.ok(note.content.includes('> «رَبِّ الْعَالَمِينَ» — 1:2'));
});

test('ExplainBackCheckService enforces remote consent, learning mode, and saves notes', async () => {
  const db = createTestDb();
  const settingsRepo = new SqliteSettingsRepository(db);

  let aiSettings: AISettings = REMOTE_OPENAI_SETTINGS;
  const service = new ExplainBackCheckService({
    db,
    settingsRepo,
    getAiSettings: () => aiSettings,
    complete: async req => {
      assert.match(req.userPrompt, /التفسير الميسر/);
      return JSON.stringify({
        right: ['فهمت المعنى العام للآية.'],
        missingOrWrong: [
          {
            point: 'أضف أن الحمد يشمل الثناء بصفات الكمال.',
            quote: 'الثناء على الله بصفاته',
            sourceTitle: 'التفسير الميسر',
          },
        ],
        followUpQuestion: 'لماذا جُمع لفظ العالمين؟',
      });
    },
    readAyahWithTafsir: async (surah, ayah) => [
      { id: 'S1', kind: 'source', title: `${surah}:${ayah}`, text: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ' },
      { id: 'S2', kind: 'tafsir', title: 'التفسير الميسر', text: 'الثناء على الله بصفاته التي كلها أوصاف كمال.' },
    ],
  });

  // 1. Remote provider without allowRemote -> permission-denied
  const denied = await service.evaluate({
    kind: 'ayah',
    target: 'quran:hafs:1:2',
    label: 'الفاتحة ٢',
    explanation: 'حمد الله على نعمه.',
    language: 'ar',
    allowRemote: false,
  });
  assert.deepEqual(denied, { ok: false, error: 'permission-denied' });

  // 2. Learning mode off -> learning-mode-off
  settingsRepo.set('ai.learningMode', 'off');
  const blocked = await service.evaluate({
    kind: 'ayah',
    target: 'quran:hafs:1:2',
    label: 'الفاتحة ٢',
    explanation: 'حمد الله على نعمه.',
    language: 'ar',
    allowRemote: true,
  });
  assert.deepEqual(blocked, { ok: false, error: 'learning-mode-off' });

  // 3. Allowed with local Ollama -> succeeds and saves note
  settingsRepo.set('ai.learningMode', 'hints');
  aiSettings = LOCAL_OLLAMA_SETTINGS;
  const okRes = await service.evaluate({
    kind: 'ayah',
    target: 'quran:hafs:1:2',
    label: 'الفاتحة ٢',
    explanation: 'حمد الله على نعمه.',
    language: 'ar',
    allowRemote: false,
  });
  assert.equal(okRes.ok, true);
  if (okRes.ok) {
    assert.equal(okRes.data.right[0], 'فهمت المعنى العام للآية.');
    assert.equal(okRes.data.missingOrWrong[0].quoteVerified, true);

    const t = translations.ar;
    const saved = service.saveNote(
      {
        kind: 'ayah',
        target: 'quran:hafs:1:2',
        label: 'الفاتحة ٢',
        explanation: 'حمد الله على نعمه.',
        feedback: okRes.data,
        language: 'ar',
      },
      {
        titlePrefix: t.explainBackNoteTitlePrefix,
        userSection: t.explainBackUserSectionLabel,
        aiSection: t.explainBackAiSectionLabel,
        rightHeading: t.explainBackRightHeading,
        missingHeading: t.explainBackMissingHeading,
        followUpHeading: t.explainBackFollowUpHeading,
        uncertaintyHeading: t.explainBackUncertaintyHeading,
        noneRecorded: t.explainBackNoneRecorded,
      },
    );
    assert.ok(saved.id);
    assert.ok(saved.content.includes('حمد الله على نعمه.'));
    assert.ok(saved.content.includes(t.explainBackAiSectionLabel));
  }

  db.close();
});
