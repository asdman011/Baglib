import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { buildChatPrompt, validateChatRequest, type ChatRequest } from '../../src/shared/assistant-chat';
import { runAssistantChat } from '../../src/main/services/ai/assistant-chat';
import { ManuscriptRepository } from '../../src/main/database/repositories/manuscript.repository';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { insertBlockIntoManuscriptSnapshot } from '../../src/shared/manuscript-snapshot';
import { emptySourceProps } from '../../src/shared/research-editor-sources';
import type { AISettings } from '../../src/shared/types/ai';

const base = (extra: Partial<ChatRequest> = {}) => ({ messages: [{ role: 'user', text: 'ما التشبيه البليغ؟' }], sources: [], lang: 'ar', allowRemote: true, ...extra });

test('validateChatRequest keeps the last turns, unique valid sources, and refuses malformed input', () => {
  assert.equal(validateChatRequest(null), 'invalid-request');
  assert.equal(validateChatRequest({ ...base(), messages: [] }), 'invalid-request', 'a chat needs a user message');
  assert.equal(validateChatRequest({ ...base(), sources: [{ target: 'javascript:alert(1)', label: 'x' }] }), 'invalid-request');
  assert.equal(validateChatRequest({ ...base(), action: 'rewrite' }), 'needs-selection');
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `turn ${i}` }));
  const clean = validateChatRequest({ ...base(), messages: [...many, { role: 'user', text: 'last' }], sources: [{ target: 'note:n1', label: 'A' }, { target: 'note:n1', label: 'A again' }] }) as ChatRequest;
  assert.equal(clean.messages.length, 12);
  assert.equal(clean.messages.at(-1)!.text, 'last');
  assert.deepEqual(clean.sources, [{ target: 'note:n1', label: 'A' }]);
  assert.ok(typeof validateChatRequest({ ...base(), messages: [], action: 'summarize' }) === 'object', 'a quick action needs no message');
});

test('buildChatPrompt talks naturally, uses sources first, allows general knowledge, and protects Quran and hadith wording', () => {
  const request = validateChatRequest({ ...base(), messages: [{ role: 'user', text: 'عرّف التشبيه' }, { role: 'assistant', text: 'هو...' }, { role: 'user', text: 'وما البليغ منه؟' }] }) as ChatRequest;
  const withSources = buildChatPrompt({ request, sources: [{ n: 1, ref: 'note:n1', label: 'فوائد', text: 'التشبيه البليغ ما حذفت فيه الأداة' }] });
  assert.match(withSources.systemPrompt, /Talk with the user naturally/);
  assert.match(withSources.systemPrompt, /still help: answer from your general knowledge/);
  assert.match(withSources.systemPrompt, /Never write a verse or a hadith from memory/);
  assert.match(withSources.systemPrompt, /\[1\] فوائد \(note:n1\)\nالتشبيه البليغ/);
  assert.match(withSources.userPrompt, /Conversation so far:\nUser: عرّف التشبيه\nAssistant: هو\.\.\.\n\nUser: وما البليغ منه؟$/);
  const bare = buildChatPrompt({ request, sources: [] });
  assert.match(bare.systemPrompt, /has not shared any material/);
  assert.doesNotMatch(bare.systemPrompt, /<SOURCES>/);
  const action = buildChatPrompt({ request: validateChatRequest({ ...base(), messages: [], action: 'translate', selection: 'نص', lang: 'ar' }) as ChatRequest, sources: [], chapter: { title: 'الفصل', text: 'نص الفصل' } });
  assert.match(action.systemPrompt, /<CHAPTER title="الفصل">\nنص الفصل/);
  assert.match(action.userPrompt, /Translate the selected passage:\n<PASSAGE>\nنص\n<\/PASSAGE>\n into English/);
});

test('runAssistantChat reads sources and the chapter itself, honours consent, and cites only listed sources', async () => {
  const db = new Database(':memory:');
  runMigrations(db, migrations);
  try {
    const repo = new ManuscriptRepository(db);
    const ms = repo.create('بحث', 'research');
    const doc = repo.createDocument(ms.id, 'الفصل الأول');
    repo.save({ id: doc.id, snapshot: insertBlockIntoManuscriptSnapshot(repo.document(doc.id).snapshot, 'ayah', { ...emptySourceProps(), url: 'quran:hafs:2:255', label: 'البقرة ٢٥٥', text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ' }).snapshot });
    const settings = { enabled: true, remoteConsent: 'gemini', provider: 'gemini', geminiApiKey: 'k' } as AISettings;
    const resolved: string[] = [];
    const prompts: string[] = [];
    const deps = {
      db, settings,
      resolve: async (target: string, label: string) => { resolved.push(target); return target === 'note:n1' ? [{ label, text: 'نص الملاحظة' }] : []; },
      complete: async (prompt: { systemPrompt: string }) => { prompts.push(prompt.systemPrompt); return 'الجواب [1] و[2] و[5]'; },
    };
    const result = await runAssistantChat({ ...base(), chapterId: doc.id, sources: [{ target: 'note:n1', label: 'ملاحظتي' }, { target: 'note:gone', label: 'x' }] }, deps);
    assert.deepEqual(resolved, ['note:n1', 'note:gone']);
    assert.match(prompts[0], /<CHAPTER title="الفصل الأول">/);
    assert.match(prompts[0], /\[1\] البقرة ٢٥٥ \(quran:hafs:2:255\)/);
    assert.match(prompts[0], /\[2\] ملاحظتي \(note:n1\)\nنص الملاحظة/);
    assert.deepEqual(result, { ok: true, text: 'الجواب [1] و[2] و', citations: [{ n: 1, ref: 'quran:hafs:2:255', label: 'البقرة ٢٥٥' }, { n: 2, ref: 'note:n1', label: 'ملاحظتي' }], sourceCount: 2 });
    assert.deepEqual(await runAssistantChat({ ...base(), allowRemote: false }, deps), { ok: false, error: 'permission-denied' });
    assert.deepEqual(await runAssistantChat(base(), { ...deps, settings: { ...settings, enabled: false } }), { ok: false, error: 'ai-disabled' });
    assert.deepEqual(await runAssistantChat(base(), { ...deps, settings: { ...settings, geminiApiKey: '' } }), { ok: false, error: 'not-configured' });
    const local = await runAssistantChat({ ...base(), allowRemote: false }, { ...deps, settings: { enabled: true, provider: 'ollama' } as AISettings });
    assert.equal(local.ok, true, 'a local Ollama needs no consent');
    const failed = await runAssistantChat(base(), { ...deps, complete: async () => { throw new Error('Gemini request failed: m: HTTP 429: quota'); } });
    assert.equal(failed.ok ? '' : failed.error, 'provider-quota');
  } finally {
    db.close();
  }
});
