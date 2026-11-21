import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  AI_ACTION_TOOLS,
  AI_ACTION_TOOL_NAMES,
  isUnableToolReply,
  looksLikeActionRequest,
  matchActionFollowUp,
  normalizeNaturalQuranTarget,
  parseBookPageRef,
  parseNaturalHadithRef,
  parsePageRanges,
  validateToolCallArguments,
} from '../../src/shared/ai-actions';
import { buildChatPrompt, CHAT_LIMITS, validateChatRequest } from '../../src/shared/assistant-chat';
import { runAssistantChat } from '../../src/main/services/ai/assistant-chat';
import { aiActionErrorText } from '../../src/renderer/components/ai/AiActionsPreview';
import {
  callModelWithTools,
  toClaudeTools,
  toGeminiFunctionDeclarations,
  toGeminiSchema,
} from '../../src/main/services/ai/actions/tool-calling';
import { AiActionsService } from '../../src/main/services/ai/actions/tool-executor';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { PersonalListsService } from '../../src/main/services/personal-lists';
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

test('AI_ACTION_TOOLS exposes only the fixed Phase 1 + Phase 2 tool set', () => {
  const names = AI_ACTION_TOOLS.map(t => t.function.name);
  assert.deepEqual(names, [...AI_ACTION_TOOL_NAMES]);
  assert.equal(names.length, 10);
  assert.equal(names.includes('create_note'), true);
  assert.equal(names.includes('append_to_note'), true);
  assert.equal(names.includes('create_cards_from_selection'), true);
  assert.equal(names.includes('add_to_personal_list'), true);
  assert.equal(names.includes('open_source'), true);
  assert.equal(names.includes('split_pdf'), true);
  assert.equal(names.includes('merge_pdfs'), true);
  assert.equal(names.includes('extract_pdf_pages'), true);
  assert.equal(names.includes('rotate_pdf_pages'), true);
  assert.equal(names.includes('ocr_pdf_page'), true);
});

test('validateToolCallArguments validates all 5 tools and rejects unsafe/invalid inputs', () => {
  assert.equal(validateToolCallArguments('exec_shell', { cmd: 'rm -rf /' }).ok, false);
  assert.equal(validateToolCallArguments('create_note', { title: '', content: 'hi' }).ok, false);
  assert.equal(validateToolCallArguments('create_note', { title: 'Note', content: 'Body' }).ok, true);

  assert.equal(validateToolCallArguments('append_to_note', { noteId: '../bad', text: 'x' }).ok, false);
  assert.equal(validateToolCallArguments('append_to_note', { noteId: 'note-1', text: 'Extra' }).ok, true);

  assert.equal(validateToolCallArguments('create_cards_from_selection', { cards: [] }).ok, false);
  assert.equal(
    validateToolCallArguments('create_cards_from_selection', {
      cards: [{ front: 'Q1', back: 'A1' }],
      sourceKind: 'quran',
      sourceRef: 'quran:hafs:1:1',
    }).ok,
    true
  );

  assert.equal(
    validateToolCallArguments('add_to_personal_list', { itemKind: 'invalid', itemRef: 'x' }).ok,
    false
  );
  assert.equal(
    validateToolCallArguments('add_to_personal_list', {
      itemKind: 'ayah',
      itemRef: 'quran:hafs:1:1',
      label: 'Al-Fatihah 1:1',
    }).ok,
    true
  );

  assert.equal(validateToolCallArguments('open_source', { target: 'https://example.com' }).ok, false);
  assert.equal(validateToolCallArguments('open_source', { target: 'file:///C:/secret.txt' }).ok, false);
  assert.equal(validateToolCallArguments('open_source', { target: 'quran:hafs:1:1' }).ok, true);
});

test('callModelWithTools supports OpenAI and Ollama tool_calls and handles unsupported models cleanly', async () => {
  const unsupportedGemini = await callModelWithTools(
    { instruction: 'Create a note', language: 'en' },
    { ...REMOTE_OPENAI_SETTINGS, provider: 'gemini', geminiApiKey: 'g-key', geminiModel: 'gemini-legacy' },
    (async () =>
      new Response(JSON.stringify({ error: { message: 'Function calling is not enabled for this model' } }), {
        status: 400,
      })) as typeof fetch
  );
  assert.equal(unsupportedGemini.ok, true);
  if (unsupportedGemini.ok) assert.equal(unsupportedGemini.kind, 'unsupported');

  const openaiRes = await callModelWithTools(
    { instruction: 'Create a note', language: 'en' },
    REMOTE_OPENAI_SETTINGS,
    (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'create_note',
                      arguments: JSON.stringify({ title: 'Summary', content: 'Key points' }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch
  );
  assert.equal(openaiRes.ok, true);
  if (openaiRes.ok && openaiRes.kind === 'tool_calls') {
    assert.equal(openaiRes.calls.length, 1);
    assert.equal(openaiRes.calls[0].name, 'create_note');
  } else {
    assert.fail('Expected OpenAI tool_calls');
  }

  const unsupportedOllama = await callModelWithTools(
    { instruction: 'Create a note', language: 'en' },
    LOCAL_OLLAMA_SETTINGS,
    (async () =>
      new Response(JSON.stringify({ error: 'registry.ollama.ai/library/gemma:2b does not support tools' }), {
        status: 400,
      })) as typeof fetch
  );
  assert.equal(unsupportedOllama.ok, true);
  if (unsupportedOllama.ok) assert.equal(unsupportedOllama.kind, 'unsupported');
});

test('AiActionsService enforces consent, learning mode, DB validation, preview-confirm, and full undo', async () => {
  const db = createTestDb();
  const settingsRepo = new SqliteSettingsRepository(db);
  const notesService = new StudyNotesService(settingsRepo, db);
  const cardRepo = new KnowledgeCardRepository(db);
  const listsService = new PersonalListsService(db);

  const existingNote = notesService.save({
    title: 'Existing Note',
    content: 'Original user text.',
    aliases: [],
    tags: [],
  });

  // Remote consent check
  const remoteService = new AiActionsService({
    db,
    settingsRepo,
    getAiSettings: () => REMOTE_OPENAI_SETTINGS,
  });
  const noConsent = await remoteService.planFromInstruction({
    instruction: 'Open Fatiha',
    language: 'en',
    allowRemote: false,
  });
  assert.deepEqual(noConsent, { ok: false, error: 'consent-required' });

  // Learning mode off check
  settingsRepo.set('ai.learningMode', 'off');
  const localService = new AiActionsService({
    db,
    settingsRepo,
    getAiSettings: () => LOCAL_OLLAMA_SETTINGS,
    completeWithTools: async () => ({
      ok: true,
      kind: 'tool_calls',
      calls: [
        { name: 'create_note', arguments: { title: 'AI Note', content: 'Draft note body' } },
        { name: 'append_to_note', arguments: { noteId: existingNote.id, text: 'Appended insight' } },
        {
          name: 'create_cards_from_selection',
          arguments: {
            cards: [{ front: 'What is the opening surah?', back: 'Al-Fatihah' }],
            sourceKind: 'quran',
            sourceRef: 'quran:hafs:1:1',
            sourceLabel: 'Al-Fatihah 1:1',
          },
        },
        {
          name: 'add_to_personal_list',
          arguments: {
            listId: 'starred',
            itemKind: 'ayah',
            itemRef: 'quran:hafs:1:1',
            label: 'Al-Fatihah 1:1',
          },
        },
        {
          name: 'open_source',
          arguments: { target: 'quran:hafs:1:1', label: 'Al-Fatihah 1:1' },
        },
      ],
    }),
  });
  const modeOff = await localService.planFromInstruction({ instruction: 'Do all', language: 'en' });
  assert.deepEqual(modeOff, { ok: false, error: 'learning-mode-off' });
  settingsRepo.set('ai.learningMode', 'full');

  // Missing DB entity validation
  const missingTarget = await localService.buildPreviewPlan(
    [{ name: 'append_to_note', arguments: { noteId: 'non-existent-id', text: 'x' } }],
    'en'
  );
  assert.equal(missingTarget.ok, false);
  if (!missingTarget.ok) assert.equal(missingTarget.error, 'not-found');

  // Plan multi-step action
  const planRes = await localService.planFromInstruction({
    instruction: 'Create a note, append to my note, make a card, star Fatiha 1:1, and open it',
    language: 'en',
  });
  assert.equal(planRes.ok, true);
  if (!planRes.ok || planRes.kind !== 'plan') assert.fail('Expected plan');
  assert.equal(planRes.plan.steps.length, 5);

  // Before confirm: DB is untouched
  assert.equal(notesService.list().length, 1);
  assert.equal(cardRepo.list().length, 0);
  assert.equal(listsService.items('starred').length, 0);

  // Confirm execution
  const confirmRes = await localService.confirmPlan(planRes.plan.planId, 'en');
  assert.equal(confirmRes.ok, true);
  if (!confirmRes.ok) assert.fail('Expected confirm ok');
  assert.equal(confirmRes.executed.length, 5);
  assert.deepEqual(confirmRes.openTargets, ['quran:hafs:1:1']);
  assert.equal(confirmRes.canUndo, true);

  // Verify created note has AI marker + tag
  const allNotes = notesService.list();
  assert.equal(allNotes.length, 2);
  const createdNote = allNotes.find(n => n.title === 'AI Note')!;
  assert.ok(createdNote.content.includes(translations.en.aiGeneratedMarker));
  assert.ok(createdNote.tags.includes('ai-generated'));

  // Verify appended note preserves original text + appends AI marker
  const updatedNote = notesService.list(existingNote.id)[0];
  assert.ok(updatedNote.content.startsWith('Original user text.'));
  assert.ok(updatedNote.content.includes(translations.en.aiGeneratedMarker));
  assert.ok(updatedNote.content.includes('Appended insight'));

  // Verify card is marked AI-generated, tagged, and NOT memorizing (no srs_state row)
  const cards = cardRepo.list();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].memorizing, false);
  assert.ok(cards[0].back.includes(translations.en.aiGeneratedMarker));
  const cardTags = db
    .prepare('SELECT t.name FROM tag t JOIN knowledge_tag kt ON kt.tag_id = t.id WHERE kt.knowledge_id = ?')
    .all(cards[0].id) as { name: string }[];
  assert.ok(cardTags.some(t => t.name === 'ai-generated'));
  const srsRow = db.prepare('SELECT 1 FROM srs_state WHERE knowledge_id = ?').get(cards[0].id);
  assert.equal(srsRow, undefined);

  // Verify personal list item added
  assert.equal(listsService.items('starred').length, 1);

  // Undo execution
  const undoRes = await localService.undoExecution(confirmRes.executionId);
  assert.equal(undoRes.ok, true);
  if (!undoRes.ok) assert.fail('Expected undo ok');
  assert.equal(undoRes.revertOpenSource, true);

  // Verify everything is reverted
  assert.equal(notesService.list().length, 1);
  assert.equal(notesService.list(existingNote.id)[0].content, 'Original user text.');
  assert.equal(cardRepo.list().length, 0);
  assert.equal(listsService.items('starred').length, 0);

  // Double-undo rejected
  const secondUndo = await localService.undoExecution(confirmRes.executionId);
  assert.deepEqual(secondUndo, { ok: false, error: 'already-undone' });

  db.close();
});

test('Phase 2 PDF tool schemas and parsePageRanges validate inputs and reject unsafe paths/ranges', () => {
  assert.equal(validateToolCallArguments('split_pdf', { workId: '../secret', ranges: '1-2' }).ok, false);
  assert.equal(validateToolCallArguments('split_pdf', { workId: 'w1', ranges: '1-2,3-4' }).ok, true);
  assert.equal(validateToolCallArguments('split_pdf', { workId: 'w1', pagesPerFile: 2 }).ok, true);

  assert.equal(validateToolCallArguments('merge_pdfs', { sources: [{ workId: 'w1' }] }).ok, false);
  assert.equal(validateToolCallArguments('merge_pdfs', { sources: [{ workId: 'w1' }, { workId: 'w2' }] }).ok, true);

  assert.equal(validateToolCallArguments('extract_pdf_pages', { workId: 'w1', pages: 'abc' }).ok, false);
  assert.equal(validateToolCallArguments('extract_pdf_pages', { workId: 'w1', pages: '1,3-5' }).ok, true);

  assert.equal(validateToolCallArguments('rotate_pdf_pages', { workId: 'w1', angle: 45 }).ok, false);
  assert.equal(validateToolCallArguments('rotate_pdf_pages', { workId: 'w1', angle: 90, pages: '1-2' }).ok, true);

  assert.equal(validateToolCallArguments('ocr_pdf_page', { workId: 'w1', page: 0 }).ok, false);
  assert.equal(validateToolCallArguments('ocr_pdf_page', { workId: 'w1', page: 2, language: 'ara' }).ok, true);

  assert.deepEqual(parsePageRanges('1, 3-5', 6), {
    ok: true,
    pages: [1, 3, 4, 5],
    groups: [[1], [3, 4, 5]],
  });
  assert.equal(parsePageRanges('5-3', 6).ok, false);
  assert.equal(parsePageRanges('1-7', 6).ok, false);
  assert.equal(parsePageRanges('0,2', 6).ok, false);
  assert.equal(parsePageRanges('', 6).ok, false);
});

test('Phase 2 PDF actions resolve library paths, validate page ranges, respect text-layer OCR guard, write new files, and undo deletes only new files', async () => {
  const db = createTestDb();
  const settingsRepo = new SqliteSettingsRepository(db);
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'baglib-ai-pdf-test-'));

  try {
    const pdf1 = path.join(tempDir, 'book-one.pdf');
    const pdf2 = path.join(tempDir, 'book-two.pdf');
    writeFileSync(pdf1, '%PDF-1.4\n%test1\n');
    writeFileSync(pdf2, '%PDF-1.4\n%test2\n');

    db.prepare(`INSERT INTO work (id, title) VALUES ('w1', 'Book One'), ('w2', 'Book Two')`).run();
    db.prepare(`INSERT INTO edition (id, work_id) VALUES ('e1', 'w1'), ('e2', 'w2')`).run();
    db.prepare(`INSERT INTO source (id, edition_id, source_type) VALUES ('s1', 'e1', 'file'), ('s2', 'e2', 'file')`).run();
    db.prepare(`INSERT INTO file_source_detail (source_id, file_path, file_format) VALUES ('s1', ?, 'pdf'), ('s2', ?, 'pdf')`).run(pdf1, pdf2);

    const service = new AiActionsService({
      db,
      settingsRepo,
      getAiSettings: () => LOCAL_OLLAMA_SETTINGS,
      inspectPdf: async (_pdfPath, checkTextPage) => ({
        totalPages: 4,
        pageHasText: checkTextPage === 1,
      }),
      pdfRunner: {
        async splitPdf({ outputPaths }) {
          for (const out of outputPaths) writeFileSync(out, '%PDF-1.4\n%split\n');
          return outputPaths;
        },
        async mergePdfs({ outputPath }) {
          writeFileSync(outputPath, '%PDF-1.4\n%merged\n');
          return [outputPath];
        },
        async extractPdfPages({ outputPath }) {
          writeFileSync(outputPath, '%PDF-1.4\n%extracted\n');
          return [outputPath];
        },
        async rotatePdfPages({ outputPath }) {
          writeFileSync(outputPath, '%PDF-1.4\n%rotated\n');
          return [outputPath];
        },
        async ocrPdfPage({ page, outputPath }) {
          writeFileSync(outputPath, `OCR text for page ${page}`, 'utf8');
          return [outputPath];
        },
      },
    });

    // Out-of-range page rejected in main
    const badRange = await service.buildPreviewPlan(
      [{ name: 'extract_pdf_pages', arguments: { workId: 'w1', pages: '2-9' } }],
      'en'
    );
    assert.deepEqual(badRange, { ok: false, error: 'invalid-arguments', detail: 'page-out-of-range' });

    // Unknown workId rejected (model cannot pass arbitrary paths)
    const unknownWork = await service.buildPreviewPlan(
      [{ name: 'rotate_pdf_pages', arguments: { workId: 'missing-work', angle: 90 } }],
      'en'
    );
    assert.equal(unknownWork.ok, false);
    if (!unknownWork.ok) assert.equal(unknownWork.error, 'not-found');

    // OCR on page 1 (which already has a text layer) is blocked unless force=true
    const ocrTextLayer = await service.buildPreviewPlan(
      [{ name: 'ocr_pdf_page', arguments: { workId: 'w1', page: 1, language: 'ara' } }],
      'en'
    );
    assert.deepEqual(ocrTextLayer, { ok: false, error: 'invalid-arguments', detail: 'page-already-has-text-layer' });

    // Plan all 5 PDF operations (OCR on scanned page 2)
    const planRes = await service.buildPreviewPlan(
      [
        { name: 'split_pdf', arguments: { workId: 'w1', ranges: '1-2,3-4' } },
        { name: 'merge_pdfs', arguments: { sources: [{ workId: 'w1' }, { workId: 'w2' }] } },
        { name: 'extract_pdf_pages', arguments: { workId: 'w1', pages: '1,3' } },
        { name: 'rotate_pdf_pages', arguments: { workId: 'w1', angle: 90, pages: '2-4' } },
        { name: 'ocr_pdf_page', arguments: { workId: 'w1', page: 2, language: 'ara' } },
      ],
      'en'
    );
    assert.equal(planRes.ok, true);
    if (!planRes.ok || planRes.kind !== 'plan') assert.fail('Expected PDF action plan');
    assert.equal(planRes.plan.steps.length, 5);

    const plannedOutputs = planRes.plan.steps.flatMap(s => s.details.outputPaths ?? []);
    assert.equal(plannedOutputs.length, 6);
    for (const out of plannedOutputs) {
      assert.equal(path.dirname(out), tempDir);
      assert.equal(fs.existsSync(out), false);
    }

    // Confirm executes and creates new files next to source
    const confirmRes = await service.confirmPlan(planRes.plan.planId, 'en');
    assert.equal(confirmRes.ok, true);
    if (!confirmRes.ok) assert.fail('Expected PDF confirm ok');
    for (const out of plannedOutputs) {
      assert.equal(fs.existsSync(out), true);
    }
    assert.equal(fs.existsSync(pdf1), true);
    assert.equal(fs.existsSync(pdf2), true);

    // Undo deletes ONLY the new output files; originals remain untouched
    const undoRes = await service.undoExecution(confirmRes.executionId);
    assert.equal(undoRes.ok, true);
    for (const out of plannedOutputs) {
      assert.equal(fs.existsSync(out), false);
    }
    assert.equal(fs.existsSync(pdf1), true);
    assert.equal(fs.existsSync(pdf2), true);
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('KEY-445: open_source normalizes natural Quran, Hadith, and book-page references in ar and en', async () => {
  const db = createTestDb();
  const settingsRepo = new SqliteSettingsRepository(db);
  settingsRepo.set('ai.learningMode', 'full');

  try {
    db.prepare(`INSERT INTO work (id, title) VALUES ('w-master', 'The Master and His Emissary'), ('w-muqaddimah', 'مُقَدِّمَةُ ابْنِ خَلْدُونَ')`).run();

    const makeService = (targetArg: string) =>
      new AiActionsService({
        db,
        settingsRepo,
        getAiSettings: () => LOCAL_OLLAMA_SETTINGS,
        completeWithTools: async () => ({
          ok: true,
          kind: 'tool_calls',
          calls: [{ name: 'open_source', arguments: { target: targetArg } }],
        }),
        resolveSunnahHadith: async (collection, hadithNumber) =>
          collection === 'Bukhari' && hadithNumber === '1'
            ? { target: 'sunnah:Bukhari:1:Bukhari:1:1', label: 'Bukhari 1' }
            : null,
      });

    // Quran natural forms
    for (const quranPhrase of ['2:11', 'ayah 2:11', 'Quran 2:11', 'البقرة 11', 'سورة البقرة آية 11']) {
      assert.equal(normalizeNaturalQuranTarget(quranPhrase), 'quran:hafs:2:11');
      const svc = makeService(quranPhrase);
      const plan = await svc.planFromInstruction({ instruction: `open ${quranPhrase}`, language: 'en' });
      assert.equal(plan.ok, true);
      if (!plan.ok || plan.kind !== 'plan') assert.fail(`Expected plan for ${quranPhrase}`);
      assert.equal(plan.plan.steps[0].details.target, 'quran:hafs:2:11');
      const confirmed = await svc.confirmPlan(plan.plan.planId, 'en');
      assert.equal(confirmed.ok, true);
    }

    // Hadith natural forms (English + Arabic-Indic digits)
    assert.deepEqual(parseNaturalHadithRef('Bukhari 1'), { collection: 'Bukhari', hadithNumber: '1' });
    assert.deepEqual(parseNaturalHadithRef('البخاري ١'), { collection: 'Bukhari', hadithNumber: '1' });
    for (const hadithPhrase of ['Bukhari 1', 'البخاري ١']) {
      const svc = makeService(hadithPhrase);
      const plan = await svc.planFromInstruction({ instruction: `open ${hadithPhrase}`, language: 'ar' });
      assert.equal(plan.ok, true);
      if (!plan.ok || plan.kind !== 'plan') assert.fail(`Expected plan for ${hadithPhrase}`);
      assert.equal(plan.plan.steps[0].details.target, 'sunnah:Bukhari:1:Bukhari:1:1');
    }

    // Book + page natural forms
    assert.deepEqual(parseBookPageRef('page 40 of The Master and His Emissary'), {
      query: 'The Master and His Emissary',
      page: 40,
    });
    assert.deepEqual(parseBookPageRef('صفحة ٤٠ من مقدمة ابن خلدون'), {
      query: 'مقدمة ابن خلدون',
      page: 40,
    });

    const bookPagePlan = await makeService('page 40 of the master and his emissary').planFromInstruction({
      instruction: 'open page 40 of the master and his emissary',
      language: 'en',
    });
    assert.equal(bookPagePlan.ok, true);
    if (!bookPagePlan.ok || bookPagePlan.kind !== 'plan') assert.fail('Expected book page plan');
    assert.equal(bookPagePlan.plan.steps[0].details.target, 'book:w-master#p=40');

    const arBookPagePlan = await makeService('صفحة ٤٠ من مقدمه ابن خلدون').planFromInstruction({
      instruction: 'افتح صفحة ٤٠ من مقدمه ابن خلدون',
      language: 'ar',
    });
    assert.equal(arBookPagePlan.ok, true);
    if (!arBookPagePlan.ok || arBookPagePlan.kind !== 'plan') assert.fail('Expected Arabic book page plan');
    assert.equal(arBookPagePlan.plan.steps[0].details.target, 'book:w-muqaddimah#p=40');
  } finally {
    db.close();
  }
});

test('KEY-445: PDF and book tools resolve titles, reject invented IDs, list candidates on 2+ matches, and give honest localized errors', async () => {
  const db = createTestDb();
  const settingsRepo = new SqliteSettingsRepository(db);
  settingsRepo.set('ai.learningMode', 'full');
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'baglib-key445-test-'));

  try {
    const masterPdf = path.join(tempDir, 'master.pdf');
    const muq1Pdf = path.join(tempDir, 'muq1.pdf');
    const muq2Pdf = path.join(tempDir, 'muq2.pdf');
    writeFileSync(masterPdf, '%PDF-1.4\n%master\n');
    writeFileSync(muq1Pdf, '%PDF-1.4\n%muq1\n');
    writeFileSync(muq2Pdf, '%PDF-1.4\n%muq2\n');

    db.prepare(
      `INSERT INTO work (id, title) VALUES
        ('w-master', 'The Master and His Emissary'),
        ('w-muq-1', 'مقدمة ابن خلدون - طبعة أولى'),
        ('w-muq-2', 'مقدمة ابن خلدون - طبعة ثانية')`
    ).run();
    db.prepare(
      `INSERT INTO edition (id, work_id) VALUES ('e-master', 'w-master'), ('e-muq-1', 'w-muq-1'), ('e-muq-2', 'w-muq-2')`
    ).run();
    db.prepare(
      `INSERT INTO source (id, edition_id, source_type) VALUES ('s-master', 'e-master', 'file'), ('s-muq-1', 'e-muq-1', 'file'), ('s-muq-2', 'e-muq-2', 'file')`
    ).run();
    db.prepare(
      `INSERT INTO file_source_detail (source_id, file_path, file_format) VALUES ('s-master', ?, 'pdf'), ('s-muq-1', ?, 'pdf'), ('s-muq-2', ?, 'pdf')`
    ).run(masterPdf, muq1Pdf, muq2Pdf);

    let nextCalls: Array<{ name: unknown; arguments: unknown }> = [];
    const service = new AiActionsService({
      db,
      settingsRepo,
      getAiSettings: () => LOCAL_OLLAMA_SETTINGS,
      completeWithTools: async () => ({
        ok: true,
        kind: 'tool_calls',
        calls: nextCalls,
      }),
      inspectPdf: async () => ({ totalPages: 20, pageHasText: true }),
      pdfRunner: {
        async splitPdf({ outputPaths }) { return outputPaths; },
        async mergePdfs({ outputPath }) { return [outputPath]; },
        async extractPdfPages({ outputPath }) {
          writeFileSync(outputPath, '%PDF-1.4\n%extracted\n');
          return [outputPath];
        },
        async rotatePdfPages({ outputPath }) { return [outputPath]; },
        async ocrPdfPage({ outputPath }) { return [outputPath]; },
      },
    });

    // 1. Exact user request: "extract pages 8 to 12 from the master and his emissary"
    nextCalls = [{ name: 'extract_pdf_pages', arguments: { bookTitle: 'the master and his emissary', pages: '8-12' } }];
    const extractPlan = await service.planFromInstruction({
      instruction: 'extract pages 8 to 12 from the master and his emissary',
      language: 'en',
    });
    assert.equal(extractPlan.ok, true);
    if (!extractPlan.ok || extractPlan.kind !== 'plan') assert.fail('Expected extract plan');
    assert.equal(extractPlan.plan.steps[0].details.sourceLabel, 'The Master and His Emissary');
    const extractConfirm = await service.confirmPlan(extractPlan.plan.planId, 'en');
    assert.equal(extractConfirm.ok, true);
    if (!extractConfirm.ok) assert.fail('Expected extract confirm');
    const createdFile = extractConfirm.executed[0].outputPaths?.[0];
    assert.ok(createdFile && fs.existsSync(createdFile));
    await service.undoExecution(extractConfirm.executionId);
    assert.equal(fs.existsSync(createdFile), false);

    // 2. 0 matches -> clear not-found error
    nextCalls = [{ name: 'extract_pdf_pages', arguments: { bookTitle: 'Nonexistent Book', pages: '1-2' } }];
    const missingPlan = await service.planFromInstruction({
      instruction: 'extract pages 1 to 2 from Nonexistent Book',
      language: 'en',
    });
    assert.deepEqual(missingPlan, { ok: false, error: 'not-found', detail: 'book:Nonexistent Book' });

    // 3. Invented workId -> rejected cleanly (never trusted)
    nextCalls = [{ name: 'extract_pdf_pages', arguments: { workId: 'work:master-and-his-emissary', pages: '8-12' } }];
    const inventedPlan = await service.planFromInstruction({
      instruction: 'extract pages 8 to 12 from the master and his emissary',
      language: 'en',
    });
    assert.equal(inventedPlan.ok, false);

    // 4. 2+ matches -> preview lists candidates; confirm requires pick; confirm with pick executes chosen one
    nextCalls = [{ name: 'extract_pdf_pages', arguments: { bookTitle: 'مقدمة ابن خلدون', pages: '8-12' } }];
    const multiPlan = await service.planFromInstruction({
      instruction: 'استخرج الصفحات 8 إلى 12 من مقدمة ابن خلدون',
      language: 'ar',
    });
    assert.equal(multiPlan.ok, true);
    if (!multiPlan.ok || multiPlan.kind !== 'plan') assert.fail('Expected multi-candidate plan');
    const step = multiPlan.plan.steps[0];
    assert.equal(step.details.candidates?.length, 2);

    const missingPick = await service.confirmPlan(multiPlan.plan.planId, 'ar');
    assert.deepEqual(missingPick, { ok: false, error: 'invalid-arguments', detail: 'candidate-selection-required' });

    const pickedConfirm = await service.confirmPlan(multiPlan.plan.planId, 'ar', {
      [step.stepId]: { workId: 'w-muq-2', sourceId: 's-muq-2' },
    });
    assert.equal(pickedConfirm.ok, true);
    if (!pickedConfirm.ok) assert.fail('Expected picked confirm ok');
    const pickedOut = pickedConfirm.executed[0].outputPaths?.[0];
    assert.ok(pickedOut && path.basename(pickedOut).startsWith('muq2'));
    await service.undoExecution(pickedConfirm.executionId);

    // 5. Honest localized error messages in ar and en (never blame provider for validation/lookup errors)
    for (const lang of ['ar', 'en'] as const) {
      const t = (key: keyof typeof translations.en, params?: Record<string, string | number>) => {
        let str: string = translations[lang][key];
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            str = str.replace(`{${k}}`, String(v));
          }
        }
        return str;
      };
      const notFoundMsg = aiActionErrorText('not-found', 'book:The Master and His Emissary', t);
      const invalidTargetMsg = aiActionErrorText('invalid-arguments', 'invalid-source-target', t);
      assert.ok(!notFoundMsg.includes('المزوّد') && !notFoundMsg.includes('provider'));
      assert.ok(!invalidTargetMsg.includes('المزوّد') && !invalidTargetMsg.includes('provider'));
      assert.ok(notFoundMsg.includes('The Master and His Emissary'));
    }
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('KEY-446: action intent detection, unable-tool reply detection, attached book targeting, and multi-source chat limits', async () => {
  // 1. Natural action intent detection in English & Arabic
  assert.equal(looksLikeActionRequest('extract pages 8 to 12 from the master and his emissary'), true);
  assert.equal(looksLikeActionRequest('استخرج الصفحات 8 إلى 12 من كتاب الرسالة'), true);
  assert.equal(looksLikeActionRequest('split this pdf every 5 pages'), true);
  assert.equal(looksLikeActionRequest('افصل ملف PDF إلى ملفات'), true);
  assert.equal(looksLikeActionRequest('open ayah 2:255'), true);
  assert.equal(looksLikeActionRequest('create a note from this selection'), true);
  assert.equal(looksLikeActionRequest('make flashcards from this passage'), true);
  assert.equal(looksLikeActionRequest('add this book to my reading list'), true);

  // Regular chat questions should NOT be misrouted as actions
  assert.equal(looksLikeActionRequest('What does Ibn Khaldun say about asabiyyah?'), false);
  assert.equal(looksLikeActionRequest('اشرح معنى هذه الآية الكريمة'), false);
  assert.equal(looksLikeActionRequest('Summarize the main arguments'), false);

  // 2. Plain-text refusal/no-tool reply detection
  assert.equal(isUnableToolReply('I cannot extract pages from the PDF. Please use the Add source feature.'), true);
  assert.equal(isUnableToolReply('لا أستطيع استخراج الصفحات من الملف.'), true);
  assert.equal(isUnableToolReply('The book discusses the divided brain.'), false);

  // 3. Attached book fallback in AiActionsService.planFromInstruction
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'baglib-key446-'));
  const db = new Database(':memory:');
  try {
    runMigrations(db, migrations);
    const settingsRepo = new SqliteSettingsRepository(db);
    const pdfPath = path.join(tempDir, 'master.pdf');
    writeFileSync(pdfPath, '%PDF-1.4\n%fake\n');
    db.prepare('INSERT INTO work (id, title) VALUES (?, ?)').run('w-attached', 'The Master and His Emissary');
    db.prepare('INSERT INTO edition (id, work_id) VALUES (?, ?)').run('e-attached', 'w-attached');
    db.prepare('INSERT INTO source (id, edition_id, source_type) VALUES (?, ?, ?)').run('s-attached', 'e-attached', 'file');
    db.prepare('INSERT INTO file_source_detail (source_id, file_path, file_format, file_size_bytes) VALUES (?, ?, ?, ?)').run('s-attached', pdfPath, 'PDF', 100);

    const service = new AiActionsService({
      db,
      settingsRepo,
      getAiSettings: () => ({ enabled: true, provider: 'ollama', ollamaEndpoint: 'http://127.0.0.1:11434', ollamaModel: 'llama3.2', learningMode: { globalChat: 'full' } }),
      completeWithTools: async () => ({
        ok: true,
        kind: 'tool_calls',
        calls: [{ name: 'extract_pdf_pages', arguments: { bookTitle: 'this book', pages: '8-12' } }],
      }),
      inspectPdf: async () => ({ totalPages: 20, hasTextLayer: true, textPages: 20 }),
    });

    const planRes = await service.planFromInstruction({
      instruction: 'extract pages 8 to 12',
      language: 'en',
      allowRemote: false,
      context: {
        sources: [{ target: 'book:w-attached@s-attached', label: 'The Master and His Emissary' }],
      },
    });
    assert.equal(planRes.ok, true);
    if (!planRes.ok || planRes.kind !== 'plan') assert.fail('Expected plan from attached book');
    assert.equal(planRes.plan.steps[0].tool, 'extract_pdf_pages');
    assert.ok(planRes.plan.steps[0].summary.includes('The Master and His Emissary'));
    assert.equal(planRes.plan.steps[0].details.outputPaths?.length, 1);
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }

  // 4. Multi-source chat validation & bounded excerpt limits
  const validated = validateChatRequest({
    messages: [{ role: 'user', text: 'Summarize these attached materials.' }],
    sources: [
      { target: 'book:w1@s1', label: 'Book 1' },
      { target: 'quran:hafs:2:255-257', label: '2:255-257' },
      { target: 'poetry:ashaar:12:0:3', label: 'Poem' },
      { target: 'media:11111111-1111-1111-1111-111111111111', label: 'Lecture' },
      { target: 'manuscript:ms-1', label: 'Manuscript' },
    ],
    lang: 'en',
    allowRemote: false,
  });
  assert.notEqual(validated, 'invalid-request');
  if (typeof validated === 'string') assert.fail('Expected valid ChatRequest');
  assert.equal(validated.sources.length, 5);

  const hugeText = 'x'.repeat(CHAT_LIMITS.sourceText + 5000);
  const prompt = buildChatPrompt({
    request: validated,
    sources: [{ n: 1, ref: 'book:w1@s1', label: 'Book 1', text: hugeText }],
  });
  assert.ok(prompt.userPrompt.length < CHAT_LIMITS.sourceText + 1000);
});

test('KEY-448: callModelWithTools supports native Gemini and Claude tool calling with recorded response fixtures', async () => {
  // 1. Schema translation: Gemini strips unsupported JSON Schema keywords & integer enums; Claude maps input_schema
  const geminiDecls = toGeminiFunctionDeclarations();
  assert.equal(geminiDecls.length, AI_ACTION_TOOLS.length);
  const rotateDecl = geminiDecls.find(d => d.name === 'rotate_pdf_pages');
  assert.ok(rotateDecl);
  const rotateJson = JSON.stringify(rotateDecl.parameters);
  assert.equal(rotateJson.includes('additionalProperties'), false);
  assert.equal(rotateJson.includes('minLength'), false);
  assert.equal(rotateJson.includes('maxLength'), false);
  const angleProp = (rotateDecl.parameters.properties as Record<string, Record<string, unknown>>).angle;
  assert.equal(angleProp.enum, undefined);
  assert.ok(String(angleProp.description).includes('90, 180, 270'));

  const reduced = toGeminiSchema({
    type: 'object',
    additionalProperties: false,
    properties: {
      items: { type: 'array', minItems: 1, maxItems: 5, items: { type: 'string', minLength: 1 } },
      mode: { type: 'string', enum: ['a', 'b'] },
    },
  });
  assert.equal((reduced.properties as Record<string, Record<string, unknown>>).mode.enum?.toString(), 'a,b');
  assert.equal((reduced.properties as Record<string, Record<string, unknown>>).items.minItems, undefined);

  const claudeTools = toClaudeTools();
  assert.equal(claudeTools.length, AI_ACTION_TOOLS.length);
  assert.ok(claudeTools[0].input_schema);

  const geminiSettings: AISettings = {
    ...REMOTE_OPENAI_SETTINGS,
    provider: 'gemini',
    geminiApiKey: 'AIza-test-key',
    geminiModel: 'gemini-2.5-flash',
  };
  const claudeSettings: AISettings = {
    ...REMOTE_OPENAI_SETTINGS,
    provider: 'claude',
    claudeApiKey: 'sk-ant-test-key',
    claudeModel: 'claude-3-5-sonnet-20241022',
  };

  // 2. Gemini: single functionCall (ignoring thought parts)
  let capturedGeminiUrl = '';
  let capturedGeminiInit: RequestInit | undefined;
  const geminiSingle = await callModelWithTools(
    { instruction: 'extract pages 8 to 12 from My Book', language: 'en' },
    geminiSettings,
    (async (url, init) => {
      capturedGeminiUrl = String(url);
      capturedGeminiInit = init;
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { thought: true, text: 'Let me call extract_pdf_pages.' },
                  { functionCall: { name: 'extract_pdf_pages', args: { bookTitle: 'My Book', pages: '8-12' } } },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch
  );
  assert.equal(
    capturedGeminiUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  );
  assert.equal(capturedGeminiInit?.redirect, 'error');
  assert.equal((capturedGeminiInit?.headers as Record<string, string>)['x-goog-api-key'], 'AIza-test-key');
  const geminiReqBody = JSON.parse(String(capturedGeminiInit?.body));
  assert.equal(geminiReqBody.tools[0].functionDeclarations.length, AI_ACTION_TOOLS.length);
  assert.equal(geminiSingle.ok, true);
  if (!geminiSingle.ok || geminiSingle.kind !== 'tool_calls') assert.fail('Expected Gemini single tool_call');
  assert.equal(geminiSingle.calls.length, 1);
  assert.equal(geminiSingle.calls[0].name, 'extract_pdf_pages');
  assert.deepEqual(geminiSingle.calls[0].arguments, { bookTitle: 'My Book', pages: '8-12' });
  assert.equal(geminiSingle.assistantText, undefined);

  // 3. Gemini: multiple functionCall parts
  const geminiMulti = await callModelWithTools(
    { instruction: 'open ayah 2:11 and create a note', language: 'en' },
    geminiSettings,
    (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  { functionCall: { name: 'open_source', args: { target: 'ayah 2:11' } } },
                  { functionCall: { name: 'create_note', args: { title: 'Al-Baqarah 2:11', content: 'Reflection' } } },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      )) as typeof fetch
  );
  assert.equal(geminiMulti.ok, true);
  if (!geminiMulti.ok || geminiMulti.kind !== 'tool_calls') assert.fail('Expected Gemini multiple tool_calls');
  assert.equal(geminiMulti.calls.length, 2);
  assert.equal(geminiMulti.calls[0].name, 'open_source');
  assert.equal(geminiMulti.calls[1].name, 'create_note');

  // 4. Gemini: text-only response
  const geminiText = await callModelWithTools(
    { instruction: 'what can you do?', language: 'en' },
    geminiSettings,
    (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Please specify which book or verse you want to work with.' }],
              },
            },
          ],
        }),
        { status: 200 }
      )) as typeof fetch
  );
  assert.equal(geminiText.ok, true);
  if (!geminiText.ok || geminiText.kind !== 'message') assert.fail('Expected Gemini text-only message');
  assert.equal(geminiText.text, 'Please specify which book or verse you want to work with.');

  // 5. Claude: single tool_use block
  let capturedClaudeUrl = '';
  let capturedClaudeInit: RequestInit | undefined;
  const claudeSingle = await callModelWithTools(
    { instruction: 'open ayah 2:11', language: 'en' },
    claudeSettings,
    (async (url, init) => {
      capturedClaudeUrl = String(url);
      capturedClaudeInit = init;
      return new Response(
        JSON.stringify({
          id: 'msg_01',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Opening Al-Baqarah 2:11.' },
            { type: 'tool_use', id: 'toolu_01', name: 'open_source', input: { target: 'ayah 2:11' } },
          ],
          stop_reason: 'tool_use',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch
  );
  assert.equal(capturedClaudeUrl, 'https://api.anthropic.com/v1/messages');
  assert.equal(capturedClaudeInit?.redirect, 'error');
  assert.equal((capturedClaudeInit?.headers as Record<string, string>)['x-api-key'], 'sk-ant-test-key');
  assert.equal((capturedClaudeInit?.headers as Record<string, string>)['anthropic-version'], '2023-06-01');
  const claudeReqBody = JSON.parse(String(capturedClaudeInit?.body));
  assert.equal(claudeReqBody.tools.length, AI_ACTION_TOOLS.length);
  assert.equal(claudeSingle.ok, true);
  if (!claudeSingle.ok || claudeSingle.kind !== 'tool_calls') assert.fail('Expected Claude single tool_use');
  assert.equal(claudeSingle.calls.length, 1);
  assert.equal(claudeSingle.calls[0].id, 'toolu_01');
  assert.equal(claudeSingle.calls[0].name, 'open_source');
  assert.deepEqual(claudeSingle.calls[0].arguments, { target: 'ayah 2:11' });
  assert.equal(claudeSingle.assistantText, 'Opening Al-Baqarah 2:11.');

  // 6. Claude: multiple tool_use blocks
  const claudeMulti = await callModelWithTools(
    { instruction: 'extract pages 8 to 12 and create a note', language: 'en' },
    claudeSettings,
    (async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: 'tool_use', id: 'toolu_a', name: 'extract_pdf_pages', input: { bookTitle: 'My Book', pages: '8-12' } },
            { type: 'tool_use', id: 'toolu_b', name: 'create_note', input: { title: 'Pages 8-12', content: 'Extracted' } },
          ],
          stop_reason: 'tool_use',
        }),
        { status: 200 }
      )) as typeof fetch
  );
  assert.equal(claudeMulti.ok, true);
  if (!claudeMulti.ok || claudeMulti.kind !== 'tool_calls') assert.fail('Expected Claude multiple tool_use');
  assert.equal(claudeMulti.calls.length, 2);
  assert.equal(claudeMulti.calls[0].name, 'extract_pdf_pages');
  assert.equal(claudeMulti.calls[1].name, 'create_note');

  // 7. Claude: text-only response
  const claudeText = await callModelWithTools(
    { instruction: 'hello', language: 'en' },
    claudeSettings,
    (async () =>
      new Response(
        JSON.stringify({
          content: [{ type: 'text', text: 'Tell me which source or pages you would like to act on.' }],
          stop_reason: 'end_turn',
        }),
        { status: 200 }
      )) as typeof fetch
  );
  assert.equal(claudeText.ok, true);
  if (!claudeText.ok || claudeText.kind !== 'message') assert.fail('Expected Claude text-only message');
  assert.equal(claudeText.text, 'Tell me which source or pages you would like to act on.');

  // 8. Claude: unsupported model error returns unsupported
  const claudeUnsupported = await callModelWithTools(
    { instruction: 'open ayah 2:11', language: 'en' },
    claudeSettings,
    (async () =>
      new Response(JSON.stringify({ error: { message: 'This model does not support tools' } }), { status: 400 })) as typeof fetch
  );
  assert.equal(claudeUnsupported.ok, true);
  if (claudeUnsupported.ok) assert.equal(claudeUnsupported.kind, 'unsupported');
});

test('KEY-449: recorded-paths-only guard for output buttons, custom output folder, and action follow-up chat context', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'baglib-key449-'));
  const customOutDir = path.join(tempDir, 'BagLib outputs');
  const db = createTestDb();
  try {
    const settingsRepo = new SqliteSettingsRepository(db);
    const pdfPath = path.join(tempDir, 'master.pdf');
    writeFileSync(pdfPath, '%PDF-1.4\n%fake\n');
    db.prepare('INSERT INTO work (id, title) VALUES (?, ?)').run('w-master', 'The Master and His Emissary');
    db.prepare('INSERT INTO edition (id, work_id) VALUES (?, ?)').run('e-master', 'w-master');
    db.prepare('INSERT INTO source (id, edition_id, source_type) VALUES (?, ?, ?)').run('s-master', 'e-master', 'file');
    db.prepare('INSERT INTO file_source_detail (source_id, file_path, file_format, file_size_bytes) VALUES (?, ?, ?, ?)').run('s-master', pdfPath, 'PDF', 100);

    const openedPaths: string[] = [];
    const shownFolders: string[] = [];
    const importedCalls: Array<{ filePath: string; sourceWorkId?: string | null; title?: string }> = [];

    const service = new AiActionsService({
      db,
      settingsRepo,
      getAiSettings: () => ({
        ...LOCAL_OLLAMA_SETTINGS,
        aiActionOutputMode: 'custom',
        aiActionOutputDir: customOutDir,
      }),
      completeWithTools: async () => ({
        ok: true,
        kind: 'tool_calls',
        calls: [{ name: 'extract_pdf_pages', arguments: { bookTitle: 'The Master and His Emissary', pages: '8-12' } }],
      }),
      inspectPdf: async () => ({ totalPages: 25, pageHasText: true }),
      pdfRunner: {
        splitPdf: async () => [],
        mergePdfs: async () => [],
        extractPdfPages: async ({ outputPath }) => {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          writeFileSync(outputPath, '%PDF-1.4\n%extracted\n');
          return [outputPath];
        },
        rotatePdfPages: async () => [],
        ocrPdfPage: async () => [],
      },
      openPath: async filePath => {
        openedPaths.push(filePath);
        return '';
      },
      showItemInFolder: filePath => {
        shownFolders.push(filePath);
      },
      importPdfToLibrary: async params => {
        importedCalls.push(params);
        return { ok: true, workId: 'w-extracted-1' };
      },
    });

    const planRes = await service.planFromInstruction({
      instruction: 'extract pages 8 to 12 from the master and his emissary',
      language: 'en',
    });
    assert.equal(planRes.ok, true);
    if (!planRes.ok || planRes.kind !== 'plan') assert.fail('Expected plan');
    const plannedOut = planRes.plan.steps[0].details.outputPaths?.[0];
    assert.ok(plannedOut);
    assert.equal(path.dirname(plannedOut), customOutDir);

    const confirmRes = await service.confirmPlan(planRes.plan.planId, 'en');
    assert.equal(confirmRes.ok, true);
    if (!confirmRes.ok) assert.fail('Expected confirm ok');
    const recordedOut = confirmRes.executed[0].outputPaths?.[0];
    assert.equal(recordedOut, plannedOut);
    assert.equal(confirmRes.executed[0].sourceWorkId, 'w-master');
    assert.equal(confirmRes.executed[0].sourceLabel, 'The Master and His Emissary');

    // 1. Guard: arbitrary / unrecorded paths must be rejected
    const arbitraryPath = path.join(tempDir, 'secret.pdf');
    writeFileSync(arbitraryPath, '%PDF-1.4\n');
    const badOpen = await service.openOutput(confirmRes.executionId, arbitraryPath);
    assert.equal(badOpen.ok, false);
    if (!badOpen.ok) {
      assert.equal(badOpen.error, 'invalid-arguments');
      assert.equal(badOpen.detail, 'unrecorded-output-path');
    }
    const badShow = service.showOutputInFolder(confirmRes.executionId, arbitraryPath);
    assert.equal(badShow.ok, false);
    if (!badShow.ok) assert.equal(badShow.detail, 'unrecorded-output-path');
    const badAdd = await service.addOutputToLibrary(confirmRes.executionId, arbitraryPath);
    assert.equal(badAdd.ok, false);
    if (!badAdd.ok) assert.equal(badAdd.detail, 'unrecorded-output-path');
    assert.equal(openedPaths.length, 0);
    assert.equal(shownFolders.length, 0);
    assert.equal(importedCalls.length, 0);

    // 2. Recorded path works for Show in folder, Open (system before import), Add to library, and Open (reader after import)
    const showRes = service.showOutputInFolder(confirmRes.executionId, recordedOut!);
    assert.equal(showRes.ok, true);
    assert.deepEqual(shownFolders, [recordedOut]);

    const openSysRes = await service.openOutput(confirmRes.executionId, recordedOut!);
    assert.equal(openSysRes.ok, true);
    if (openSysRes.ok) assert.equal(openSysRes.mode, 'system');
    assert.deepEqual(openedPaths, [recordedOut]);

    const addRes = await service.addOutputToLibrary(confirmRes.executionId, recordedOut!);
    assert.equal(addRes.ok, true);
    if (addRes.ok) {
      assert.equal(addRes.workId, 'w-extracted-1');
      assert.equal(addRes.openTarget, 'book:w-extracted-1');
    }
    assert.equal(importedCalls.length, 1);
    assert.equal(importedCalls[0].sourceWorkId, 'w-master');

    const openReaderRes = await service.openOutput(confirmRes.executionId, recordedOut!);
    assert.equal(openReaderRes.ok, true);
    if (openReaderRes.ok) {
      assert.equal(openReaderRes.mode, 'reader');
      assert.equal(openReaderRes.openTarget, 'book:w-extracted-1');
    }
    assert.equal(openedPaths.length, 1); // did not call system openPath again

    // 3. After undo, output buttons are blocked with already-undone
    const undoRes = await service.undoExecution(confirmRes.executionId);
    assert.equal(undoRes.ok, true);
    const afterUndo = await service.openOutput(confirmRes.executionId, recordedOut!);
    assert.equal(afterUndo.ok, false);
    if (!afterUndo.ok) assert.equal(afterUndo.error, 'already-undone');

    // 4. Follow-up context in chat: "where is the output?" includes the exact recorded path
    let capturedPrompt = '';
    const chatRes = await runAssistantChat(
      {
        messages: [{ role: 'user', text: 'where is the output?' }],
        sources: [],
        lang: 'en',
        allowRemote: false,
        actionHistory: [
          {
            executionId: confirmRes.executionId,
            status: 'executed',
            steps: [
              {
                tool: 'extract_pdf_pages',
                summary: 'Extract pages (8-12) from "The Master and His Emissary"',
                sourceLabel: 'The Master and His Emissary',
                sourceWorkId: 'w-master',
                outputPaths: [recordedOut!],
              },
            ],
          },
        ],
      },
      {
        db,
        settings: LOCAL_OLLAMA_SETTINGS,
        resolve: async () => [],
        complete: async prompt => {
          capturedPrompt = `${prompt.systemPrompt}\n${prompt.userPrompt}`;
          return `The extracted file is saved at ${recordedOut!}`;
        },
      }
    );
    assert.equal(chatRes.ok, true);
    assert.ok(capturedPrompt.includes('<EXECUTED_ACTIONS>'));
    assert.ok(capturedPrompt.includes(recordedOut!));
    assert.ok(capturedPrompt.includes('The Master and His Emissary'));
    if (chatRes.ok) {
      assert.ok(chatRes.text.includes(recordedOut!));
    }

    // 5. Follow-up intent matcher (English & Arabic)
    assert.equal(matchActionFollowUp('open it'), 'open');
    assert.equal(matchActionFollowUp('افتحه'), 'open');
    assert.equal(matchActionFollowUp('undo that'), 'undo');
    assert.equal(matchActionFollowUp('تراجع عن ذلك'), 'undo');
    assert.equal(matchActionFollowUp('add it to my library'), 'add-to-library');
    assert.equal(matchActionFollowUp('أضفه إلى مكتبتي'), 'add-to-library');
    assert.equal(matchActionFollowUp('where is the output?'), null);
  } finally {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
});
