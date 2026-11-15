import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  answerForInsert, buildResearchAiPrompt, collectChapterSources, LIMITS, parseAnswerCitations, providerReady, validateResearchAiRequest,
  type ResearchAiRequest, type ResearchAiSource,
} from '../../src/shared/research-ai';
import { initialManuscriptSnapshot, insertBlockIntoManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';
import { emptySourceProps, type ResearchSourceProps } from '../../src/shared/research-editor-sources';
import { noteEmbedProps } from '../../src/shared/manuscript-notes';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { runResearchEditorAi } from '../../src/main/services/ai/research-editor-ai';
import type { AISettings } from '../../src/shared/types/ai';

const ayah = (): ResearchSourceProps => ({ ...emptySourceProps(), url: 'quran:hafs:2:255', label: 'البقرة ٢٥٥', text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ' });
const verse = (): ResearchSourceProps => ({ ...emptySourceProps(), url: 'poetry:p1#3', label: 'المتنبي', verses: [{ sadr: 'على قدر أهل العزم', ajuz: 'تأتي العزائم' }] });

test('validateResearchAiRequest cleans input and reports missing selection or question', () => {
  assert.equal(validateResearchAiRequest(null), 'invalid-request');
  assert.equal(validateResearchAiRequest({ documentId: 'd', action: 'hack', lang: 'ar' }), 'invalid-request');
  assert.equal(validateResearchAiRequest({ documentId: 'd', action: 'ask', lang: 'ar', question: '  ' }), 'needs-question');
  assert.equal(validateResearchAiRequest({ documentId: 'd', action: 'rewrite', lang: 'en' }), 'needs-selection');
  const long = validateResearchAiRequest({ documentId: 'd', action: 'summarize', lang: 'en', selection: 'x'.repeat(LIMITS.selection + 50) }) as ResearchAiRequest;
  assert.ok(long.selection!.length <= LIMITS.selection + 2);
  assert.deepEqual(validateResearchAiRequest({ documentId: 'd', action: 'translate', lang: 'ar', targetLang: 'en', selection: ' نص ' }),
    { documentId: 'd', action: 'translate', lang: 'ar', question: undefined, selection: 'نص', targetLang: 'en' });
});

test('collectChapterSources keeps only linked BagLib blocks and reads note text live, never from the block', () => {
  let snapshot = initialManuscriptSnapshot('doc', 'الفصل');
  const a = insertBlockIntoManuscriptSnapshot(snapshot, 'ayah', ayah()); snapshot = a.snapshot;
  const v = insertBlockIntoManuscriptSnapshot(snapshot, 'verse', verse()); snapshot = v.snapshot;
  const n = insertBlockIntoManuscriptSnapshot(snapshot, 'note-embed', noteEmbedProps({ id: 'n1', title: 'فوائد' })); snapshot = n.snapshot;
  const gone = insertBlockIntoManuscriptSnapshot(snapshot, 'note-embed', noteEmbedProps({ id: 'missing', title: 'x' })); snapshot = gone.snapshot;
  const links = [
    { block_id: a.blockId, target_scheme: 'quran', target_id: 'hafs:2:255' },
    { block_id: v.blockId, target_scheme: 'poetry', target_id: 'p1#3' },
    { block_id: n.blockId, target_scheme: 'note', target_id: 'n1' },
    { block_id: gone.blockId, target_scheme: 'note', target_id: 'missing' },
  ];
  const sources = collectChapterSources(snapshot, links, id => (id === 'n1' ? { title: 'فوائد في البلاغة', content: 'التشبيه البليغ' } : undefined));
  assert.deepEqual(sources.map(s => [s.n, s.ref, s.label]), [[1, 'quran:hafs:2:255', 'البقرة ٢٥٥'], [2, 'poetry:p1#3', 'المتنبي'], [3, 'note:n1', 'فوائد في البلاغة']]);
  assert.equal(sources[1].text, 'على قدر أهل العزم … تأتي العزائم');
  assert.equal(sources[2].text, 'التشبيه البليغ');
  // A block with no manuscript_link row is not context.
  assert.equal(collectChapterSources(snapshot, links.slice(0, 1), () => undefined).length, 1);
});

test('buildResearchAiPrompt grounds the model in the chapter and numbered sources', () => {
  const sources: ResearchAiSource[] = [{ n: 1, ref: 'quran:hafs:2:255', label: 'البقرة ٢٥٥', text: 'آية الكرسي' }];
  const request: ResearchAiRequest = { documentId: 'd', action: 'translate', lang: 'ar', selection: 'نص مختار' };
  const { systemPrompt, userPrompt } = buildResearchAiPrompt({ request, chapterTitle: 'الفصل "الأول"', chapterText: 'نص الفصل', sources });
  assert.match(systemPrompt, /\[1\] البقرة ٢٥٥ \(quran:hafs:2:255\)\nآية الكرسي/);
  assert.match(systemPrompt, /<CHAPTER title="الفصل 'الأول'">\nنص الفصل/);
  assert.match(systemPrompt, /Only cite numbers that appear in the sources list/);
  assert.match(systemPrompt, /Answer in Arabic/);
  assert.match(userPrompt, /<PASSAGE>\nنص مختار\n<\/PASSAGE>\ninto English/);
  const none = buildResearchAiPrompt({ request: { documentId: 'd', action: 'summarize', lang: 'en' }, chapterTitle: 'C', chapterText: '', sources: [] });
  assert.match(none.systemPrompt, /cites no sources/);
  assert.match(none.userPrompt, /the whole chapter/);
});

test('parseAnswerCitations normalises Arabic digits, drops invented numbers, orders by first use', () => {
  const sources: ResearchAiSource[] = [
    { n: 1, ref: 'quran:hafs:2:255', label: 'البقرة ٢٥٥', text: '' },
    { n: 2, ref: 'note:n1', label: 'فوائد', text: '' },
  ];
  const parsed = parseAnswerCitations('التوحيد أصل [٢] وهو في الآية [1][9].', sources);
  assert.equal(parsed.text, 'التوحيد أصل [2] وهو في الآية [1].');
  assert.deepEqual(parsed.citations.map(c => c.n), [2, 1]);
  assert.equal(answerForInsert(parsed.text, parsed.citations), 'التوحيد أصل (فوائد) وهو في الآية (البقرة ٢٥٥).');
});

test('providerReady needs a key except for Ollama', () => {
  assert.equal(providerReady({ provider: 'ollama' }), true);
  assert.equal(providerReady({ provider: 'gemini' }), false);
  assert.equal(providerReady({ provider: 'gemini', geminiApiKey: 'k' }), true);
  assert.equal(providerReady({ provider: 'openai', apiKey: 'k', enabled: false }), false);
});

test('runResearchEditorAi reads the chapter and its cited sources, and only calls the chosen provider', async () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);
  try {
    const repo = new ManuscriptRepository(db);
    const notes = new StudyNotesService(new SqliteSettingsRepository(db), db);
    const note = notes.save({ title: 'فوائد في البلاغة', content: 'التشبيه البليغ ما حذف فيه الأداة', aliases: [], tags: [] });
    const ms = repo.create('بحث', 'research');
    const doc = repo.createDocument(ms.id, 'الفصل الأول');
    let snapshot = repo.document(doc.id).snapshot;
    snapshot = insertBlockIntoManuscriptSnapshot(snapshot, 'ayah', ayah()).snapshot;
    snapshot = insertBlockIntoManuscriptSnapshot(snapshot, 'note-embed', noteEmbedProps(note)).snapshot;
    repo.save({ id: doc.id, snapshot });
    const settings = { provider: 'gemini', geminiApiKey: 'test-key', enabled: true } as AISettings;
    const calls: { systemPrompt: string; userPrompt: string }[] = [];
    const result = await runResearchEditorAi({ documentId: doc.id, action: 'summarize', lang: 'ar' }, {
      db, settings, complete: async prompt => { calls.push(prompt); return 'خلاصة [1] و[2] و[7]'; },
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].systemPrompt, /التشبيه البليغ ما حذف فيه الأداة/);
    assert.match(calls[0].systemPrompt, /اللَّهُ لَا إِلَٰهَ/);
    assert.deepEqual(result, { ok: true, text: 'خلاصة [1] و[2] و', citations: [
      { n: 1, ref: 'quran:hafs:2:255', label: 'البقرة ٢٥٥' }, { n: 2, ref: `note:${note.id}`, label: 'فوائد في البلاغة' },
    ], sourceCount: 2, provider: 'gemini' });

    const unset = await runResearchEditorAi({ documentId: doc.id, action: 'summarize', lang: 'en' }, { db, settings: { ...settings, geminiApiKey: '' }, complete: async () => { throw new Error('must not call'); } });
    assert.deepEqual(unset, { ok: false, error: 'not-configured' });
    const failed = await runResearchEditorAi({ documentId: doc.id, action: 'outline', lang: 'en' }, { db, settings, complete: async () => { throw new Error('HTTP 429'); } });
    assert.deepEqual(failed, { ok: false, error: 'provider-quota', message: 'HTTP 429' });
    repo.trashDocument(doc.id);
    assert.deepEqual(await runResearchEditorAi({ documentId: doc.id, action: 'outline', lang: 'en' }, { db, settings, complete: async () => 'x' }), { ok: false, error: 'invalid-request' });
  } finally {
    db.close();
  }
});

test('Gemini calls send the key in the x-goog-api-key header, never in the URL, and move retired models', async () => {
  const { AIProviderService } = await import('../../src/main/services/ai/ai-provider.service');
  const original = globalThis.fetch;
  const seen: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
    seen.push({ url: String(url), headers: init?.headers ?? {} });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const service = AIProviderService.getInstance();
    const settings = { provider: 'gemini', geminiApiKey: 'secret-key', geminiModel: 'gemini-1.5-flash' } as AISettings;
    await service.generateChatCompletion({ systemPrompt: 's', userPrompt: 'u' }, settings);
    await service.healthCheck(settings);
    assert.equal(seen.length, 2);
    for (const call of seen) {
      assert.ok(!call.url.includes('secret-key'), call.url);
      assert.equal(call.headers['x-goog-api-key'], 'secret-key');
    }
    assert.match(seen[0].url, /models\/gemini-flash-lite-latest:generateContent$/);
  } finally {
    globalThis.fetch = original;
  }
});

test('Gemini falls back to the lite models when the chosen one is overloaded, skips thought parts, and reports every failure', async () => {
  const { AIProviderService } = await import('../../src/main/services/ai/ai-provider.service');
  const original = globalThis.fetch;
  const models: string[] = [];
  let mode: 'busy-then-ok' | 'all-quota' | 'bad-request' = 'busy-then-ok';
  globalThis.fetch = (async (url: string) => {
    const model = /models\/([^:]+):/.exec(String(url))![1];
    models.push(model);
    if (mode === 'bad-request') return new Response(JSON.stringify({ error: { message: 'Invalid argument' } }), { status: 400 });
    if (mode === 'all-quota') return new Response(JSON.stringify({ error: { message: 'You exceeded your current quota' } }), { status: 429 });
    if (model === 'gemini-busy-model') return new Response(JSON.stringify({ error: { message: 'This model is currently experiencing high demand.' } }), { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: 'الجواب' }] } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const service = AIProviderService.getInstance();
    const settings = { provider: 'gemini', geminiApiKey: 'k', geminiModel: 'gemini-busy-model' } as AISettings;
    assert.equal(await service.generateChatCompletion({ systemPrompt: 's', userPrompt: 'u' }, settings), 'الجواب');
    assert.deepEqual(models, ['gemini-busy-model', 'gemini-flash-lite-latest']);
    // The failed model cools down: the next request goes straight to the fallback.
    models.length = 0;
    await service.generateChatCompletion({ systemPrompt: 's', userPrompt: 'u' }, settings);
    assert.deepEqual(models, ['gemini-flash-lite-latest']);
    mode = 'all-quota';
    await assert.rejects(service.generateChatCompletion({ systemPrompt: 's', userPrompt: 'u' }, { ...settings, geminiModel: 'gemini-other' } as AISettings), /gemini-other: HTTP 429: You exceeded your current quota \| gemini-flash-lite-latest: HTTP 429/);
    mode = 'bad-request';
    models.length = 0;
    await assert.rejects(service.generateChatCompletion({ systemPrompt: 's', userPrompt: 'u' }, { ...settings, geminiModel: 'gemini-third' } as AISettings), /HTTP 400: Invalid argument/);
    assert.deepEqual(models, ['gemini-third'], 'a request error is not retried on other models');
  } finally {
    globalThis.fetch = original;
  }
});

test('provider errors map to actionable codes and never echo a key', async () => {
  const { providerErrorCode, providerErrorDetail } = await import('../../src/shared/ai-errors');
  assert.equal(providerErrorCode('Gemini request failed: gemini-flash-latest: HTTP 429: quota | lite: HTTP 503: high demand'), 'provider-quota');
  assert.equal(providerErrorCode('Gemini request failed: m: no answer within 50 s'), 'provider-busy');
  assert.equal(providerErrorCode('Google Gemini API key is missing.'), 'provider-auth');
  assert.equal(providerErrorCode('HTTP 400: Invalid argument'), 'provider-error');
  assert.equal(providerErrorDetail('failed ?key=AIzaSyA1234567890abcdefghijk and AQ.Ab8RN6Ji5xuSXljzKv_q'), 'failed ?key=… and …');
});

test('study assistant keeps verified citations, drops unverifiable ones, and accepts a one-item array', async () => {
  const { validateAssistantAnswer, assistantResponseSchema } = await import('../../src/shared/study-assistant');
  const sources = [{ id: 'S1', label: 'فوائد', target: 'note:n1', text: 'التشبيه البليغ ما حذفت فيه الأداة ووجه الشبه.' }];
  const answer = validateAssistantAnswer(JSON.stringify([{ answer: 'جواب', abstained: false, citations: [{ source: 'S1', quote: 'التشبيه البليغ' }, { source: 'S1', quote: 'نص مختلق' }, { source: 'S9', quote: 'x' }] }]), sources, 'qa');
  assert.deepEqual(answer.citations.map(c => c.quote), ['التشبيه البليغ']);
  assert.throws(() => validateAssistantAnswer(JSON.stringify({ answer: 'جواب', abstained: false, citations: [{ source: 'S1', quote: 'نص مختلق' }] }), sources, 'qa'), /invalid-output/);
  const cards = validateAssistantAnswer(JSON.stringify({ answer: '', abstained: false, citations: [], cards: [{ front: 'س', back: 'ج', source: 'S1', quote: 'ووجه الشبه' }, { front: 'س٢', back: 'ج٢', source: 'S1', quote: 'مختلق' }] }), sources, 'cards');
  assert.equal(cards.cards.length, 1);
  assert.deepEqual((assistantResponseSchema('cards') as { required: string[] }).required, ['answer', 'abstained', 'citations', 'cards']);
});
