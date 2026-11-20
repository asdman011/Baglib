import { ExplainBackService } from '../../src/main/services/explain-back';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_SCHOLARLY_POLICY, markAiGenerated } from '../../src/shared/ai-principles';
import { AIProviderService } from '../../src/main/services/ai/ai-provider.service';
import { AIResearchService, DEFAULT_AI_SETTINGS } from '../../src/main/services/ai/ai-research.service';
import { translationDestination } from '../../src/shared/translation-privacy';
import { TranslationService } from '../../src/main/services/ai/translation.service';
import { runResearchEditorAi } from '../../src/main/services/ai/research-editor-ai';
import { createTestDatabase } from '../helpers/test-db';
import { translations } from '../../src/renderer/translations';
import { answerAsNote } from '../../src/shared/study-assistant';

test('accepted content keeps an Arabic/English generated marker and exact mixed-script source text', () => {
  const text = 'عِلْمٌ Arabic/Latin 123';
  for (const lang of ['ar', 'en'] as const) {
    const t = translations[lang];
    assert.equal(markAiGenerated(text, t.aiGeneratedMarker), t.aiGeneratedMarker + '\n\n' + text);
    const note = answerAsNote({ answer: text, abstained: false, citations: [], cards: [], limited: false }, { sources: t.assistantSources, generated: t.aiGeneratedMarker });
    assert.ok(note.startsWith(t.aiGeneratedMarker));
    assert.ok(note.includes(text));
    assert.ok(t.aiPrinciplesNotice && t.aiRecallNudge);
  }
});

test('the real provider boundary includes no-fatwa and uncertainty guidance without changing JSON or source text', async () => {
  const original = globalThis.fetch;
  let captured: { messages: Array<{ content: string }> } = { messages: [] };
  globalThis.fetch = async (_url, options) => { captured = JSON.parse(String(options?.body)); return new Response(JSON.stringify({ message: { content: '{"ok":true}' } }), { status: 200 }); };
  try {
    const result = await AIProviderService.getInstance().generateChatCompletion({ systemPrompt: 'Return JSON only.', userPrompt: 'عِلْمٌ mixed English', json: true }, DEFAULT_AI_SETTINGS);
    assert.equal(result, '{"ok":true}');
    assert.ok(captured.messages[0].content.includes(AI_SCHOLARLY_POLICY));
    assert.match(captured.messages[0].content, /Never issue a religious ruling or fatwa/);
    assert.equal(captured.messages[1].content, 'عِلْمٌ mixed English');
  } finally { globalThis.fetch = original; }
});

test('legacy research and translation refuse disabled/unconsented remote calls before network or source reads', async () => {
  const db = createTestDatabase();
  const original = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async () => { called++; throw Error('network must not run'); };
  try {
    const service = new AIResearchService(db);
    service.saveSettings({ ...DEFAULT_AI_SETTINGS, provider: 'openai', apiKey: 'stub-key', remoteConsent: undefined });
    await assert.rejects(service.executeTool({ bookTitle: 'Book', currentPage: 1, tool: 'chat' }), /permission-denied/);
    await assert.rejects(new TranslationService().translate({ text: 'Selected text' }, service.getSettings()), /permission-denied/);
    const editor = await runResearchEditorAi({ documentId: 'missing', action: 'summarize', lang: 'ar' }, { db, settings: service.getSettings(), complete: async () => { called++; return ''; } });
    assert.deepEqual(editor, { ok: false, error: 'permission-denied' });
    service.saveSettings({ enabled: false });
    await assert.rejects(service.executeTool({ bookTitle: 'Book', currentPage: 1, tool: 'chat' }), /ai-disabled/);
    assert.equal(called, 0);
  } finally { globalThis.fetch = original; db.close(); }
});

test('a failed dedicated translator never silently transfers content to a second LLM provider', async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async url => { urls.push(String(url)); return new Response('failure', { status: 503 }); };
  try {
    await assert.rejects(new TranslationService().translate({ text: 'private passage' }, { ...DEFAULT_AI_SETTINGS, translationProvider: 'deepl', translationApiKey: 'stub:fx', translationConsent: translationDestination({ ...DEFAULT_AI_SETTINGS, translationProvider: 'deepl', translationApiKey: 'stub:fx' })!.key }), /provider-busy/);
    assert.equal(urls.length, 1);
    assert.ok(urls[0].startsWith('https://api-free.deepl.com/'));
  } finally { globalThis.fetch = original; }
});

test('reviewed explain-back notes mark AI judgments without attributing the learner summary to AI', async () => {
  for (const language of ['ar', 'en'] as const) {
    const db = createTestDatabase();
    try {
      const target = 'book:work@source#p=1';
      const summary = 'Plants need light.';
      const service = new ExplainBackService(db, new SqliteSettingsRepository(db), async () => [{ id: 'S1', target, label: 'Source مصدر', text: summary + ' Roots absorb water and leaves capture sunlight.' }], async () => JSON.stringify({ verdicts: [{ claim: 0, status: 'supported', quote: summary }] }));
      const draft = await service.check({ target, summary, language, allowRemote: false });
      const accepted = service.accept({ id: draft.id, decisions: ['supported'] });
      assert.ok(accepted.note.content.includes(translations[language].aiGeneratedMarker));
      assert.ok(accepted.note.content.indexOf(summary) < accepted.note.content.indexOf(translations[language].aiGeneratedMarker));
      assert.ok(accepted.note.tags.includes('ai-generated'));
    } finally { db.close(); }
  }
});
