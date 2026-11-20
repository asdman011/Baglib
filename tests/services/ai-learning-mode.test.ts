import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  AI_LEARNING_MODULES,
  HINTS_MODE_PROMPT_GUIDANCE,
  applyHintsPrompt,
  defaultLearningMode,
  moduleFromStudyTarget,
  moduleFromWorkspaceView,
  normalizeLearningModes,
  resolveLearningMode,
} from '../../src/shared/ai-learning-mode';
import { runAssistantChat } from '../../src/main/services/ai/assistant-chat';
import { runResearchEditorAi } from '../../src/main/services/ai/research-editor-ai';
import type { AISettings } from '../../src/shared/types/ai';

function baseSettings(overrides: Partial<AISettings> = {}): AISettings {
  return {
    enabled: true,
    provider: 'ollama',
    ollamaEndpoint: 'http://127.0.0.1:11434',
    ollamaModel: 'llama3.2',
    antiSpoilerCeiling: true,
    translationProvider: 'llm',
    targetLanguage: 'ar',
    ...overrides,
  };
}

test('defaultLearningMode: revision defaults to off, all other modules default to hints', () => {
  assert.equal(defaultLearningMode('revision'), 'off');
  for (const mod of AI_LEARNING_MODULES) {
    if (mod !== 'revision') {
      assert.equal(defaultLearningMode(mod), 'hints');
    }
  }
  assert.equal(defaultLearningMode(undefined), 'hints');
});

test('normalizeLearningModes fills defaults and ignores invalid values', () => {
  const normalized = normalizeLearningModes({
    revision: 'hints',
    reader: 'full',
    quran: 'invalid-mode',
  });
  assert.deepEqual(normalized, {
    revision: 'hints',
    reader: 'full',
    quran: 'hints',
    sunnah: 'hints',
    notes: 'hints',
    researchEditor: 'hints',
  });
});

test('resolveLearningMode enforces revision=off by default even when legacyMode is full', () => {
  const settings = baseSettings();
  assert.equal(resolveLearningMode(settings, 'revision', { legacyMode: 'full' }), 'off');
  assert.equal(resolveLearningMode(settings, 'notes', { inRevisionOrTest: true, legacyMode: 'full' }), 'off');
  assert.equal(resolveLearningMode(settings, 'notes'), 'hints');
  assert.equal(resolveLearningMode(settings, 'notes', { legacyMode: 'full' }), 'full');

  const custom = baseSettings({ learningModes: { revision: 'hints', reader: 'off' } });
  assert.equal(resolveLearningMode(custom, 'notes', { inRevisionOrTest: true }), 'hints');
  assert.equal(resolveLearningMode(custom, 'reader'), 'off');
});

test('moduleFromWorkspaceView and moduleFromStudyTarget map views and targets', () => {
  assert.equal(moduleFromWorkspaceView('reader'), 'reader');
  assert.equal(moduleFromWorkspaceView('quran'), 'quran');
  assert.equal(moduleFromWorkspaceView('sunnah'), 'sunnah');
  assert.equal(moduleFromWorkspaceView('notes'), 'notes');
  assert.equal(moduleFromWorkspaceView('notes-editor'), 'researchEditor');
  assert.equal(moduleFromWorkspaceView('dashboard'), undefined);
  assert.equal(moduleFromWorkspaceView('notes', { inRevisionOrTest: true }), 'revision');

  assert.equal(moduleFromStudyTarget('quran:hafs:1:1'), 'quran');
  assert.equal(moduleFromStudyTarget('sunnah:bukhari:1:1'), 'sunnah');
  assert.equal(moduleFromStudyTarget('book:abc#p=1'), 'reader');
  assert.equal(moduleFromStudyTarget('note:123'), 'notes');
  assert.equal(moduleFromStudyTarget('unknown:1'), undefined);
});

test('applyHintsPrompt adds hints guidance only in hints mode without revealFullAnswer', () => {
  const base = 'You are a helpful assistant.';
  const hints = applyHintsPrompt(base, 'hints');
  assert.ok(hints.includes(HINTS_MODE_PROMPT_GUIDANCE));

  const revealed = applyHintsPrompt(base, 'hints', { revealFullAnswer: true });
  assert.equal(revealed, base);

  const full = applyHintsPrompt(base, 'full');
  assert.equal(full, base);
});

test('runAssistantChat enforces revision learning mode (off -> hints -> full)', async () => {
  const db = new Database(':memory:');
  try {
    let seenSystem = '';
    let seenUser = '';
    const complete = async (req: { systemPrompt: string; userPrompt: string }) => {
      seenSystem = req.systemPrompt;
      seenUser = req.userPrompt;
      return 'Guiding hint.';
    };

    const offRes = await runAssistantChat(
      { messages: [{ role: 'user', text: 'What is the ruling?' }], sources: [], lang: 'en', allowRemote: false, inRevisionOrTest: true },
      { db, settings: baseSettings(), resolve: async () => [], complete }
    );
    assert.deepEqual(offRes, { ok: false, error: 'learning-mode-off' });

    const hintsRes = await runAssistantChat(
      { messages: [{ role: 'user', text: 'What is the ruling?' }], sources: [], lang: 'en', allowRemote: false, inRevisionOrTest: true },
      { db, settings: baseSettings({ learningModes: { revision: 'hints' } }), resolve: async () => [], complete }
    );
    assert.equal(hintsRes.ok, true);
    assert.ok(seenSystem.includes(HINTS_MODE_PROMPT_GUIDANCE));

    const revealRes = await runAssistantChat(
      {
        messages: [{ role: 'user', text: 'What is the ruling?' }],
        sources: [],
        lang: 'en',
        allowRemote: false,
        inRevisionOrTest: true,
        revealFullAnswer: true,
        attempt: 'I think it is obligatory.',
      },
      { db, settings: baseSettings({ learningModes: { revision: 'hints' } }), resolve: async () => [], complete }
    );
    assert.equal(revealRes.ok, true);
    assert.ok(!seenSystem.includes(HINTS_MODE_PROMPT_GUIDANCE));
    assert.ok(seenUser.includes('I think it is obligatory.'));
  } finally {
    db.close();
  }
});

test('runResearchEditorAi rejects when researchEditor learning mode is off', async () => {
  const db = new Database(':memory:');
  try {
    const res = await runResearchEditorAi(
      { documentId: 'doc-1', action: 'ask', question: 'Explain', lang: 'en' },
      {
        db,
        settings: baseSettings({ learningModes: { researchEditor: 'off' } }),
        complete: async () => 'Should not run',
      }
    );
    assert.deepEqual(res, { ok: false, error: 'learning-mode-off' });
  } finally {
    db.close();
  }
});
