import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  AI_ACTION_TOOLS,
  AI_ACTION_TOOL_NAMES,
  validateToolCallArguments,
} from '../../src/shared/ai-actions';
import { callModelWithTools } from '../../src/main/services/ai/actions/tool-calling';
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

test('AI_ACTION_TOOLS exposes only the fixed Phase 1 tool set', () => {
  const names = AI_ACTION_TOOLS.map(t => t.function.name);
  assert.deepEqual(names, [...AI_ACTION_TOOL_NAMES]);
  assert.equal(names.length, 5);
  assert.equal(names.includes('create_note'), true);
  assert.equal(names.includes('append_to_note'), true);
  assert.equal(names.includes('create_cards_from_selection'), true);
  assert.equal(names.includes('add_to_personal_list'), true);
  assert.equal(names.includes('open_source'), true);
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

test('callModelWithTools supports OpenAI and Ollama tool_calls and handles unsupported providers cleanly', async () => {
  const geminiRes = await callModelWithTools(
    { instruction: 'Create a note', language: 'en' },
    { ...REMOTE_OPENAI_SETTINGS, provider: 'gemini', geminiApiKey: 'g-key' }
  );
  assert.equal(geminiRes.ok, true);
  if (geminiRes.ok) assert.equal(geminiRes.kind, 'unsupported');

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
  const missingTarget = localService.buildPreviewPlan(
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
  const confirmRes = localService.confirmPlan(planRes.plan.planId, 'en');
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
  const undoRes = localService.undoExecution(confirmRes.executionId);
  assert.equal(undoRes.ok, true);
  if (!undoRes.ok) assert.fail('Expected undo ok');
  assert.equal(undoRes.revertOpenSource, true);

  // Verify everything is reverted
  assert.equal(notesService.list().length, 1);
  assert.equal(notesService.list(existingNote.id)[0].content, 'Original user text.');
  assert.equal(cardRepo.list().length, 0);
  assert.equal(listsService.items('starred').length, 0);

  // Double-undo rejected
  const secondUndo = localService.undoExecution(confirmRes.executionId);
  assert.deepEqual(secondUndo, { ok: false, error: 'already-undone' });

  db.close();
});
