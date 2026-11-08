import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerAsNote, assistantSystemPrompt, cardSourceKind, passageKind, budgetSources, quoteFound, validateAssistantAnswer, validateAssistantRequest, type AssistantSource } from '../../src/shared/study-assistant';
import { isLocalProvider } from '../../src/main/ipc/study-assistant';

const sources: AssistantSource[] = [
  { id: 'S1', label: 'الصبر', target: 'note:a', text: 'الصبر ضياء، كما في الحديث.\nوهو حبس النفس.' },
  { id: 'S2', label: 'رياض الصالحين (4)', target: 'book:b1#p=4', text: 'Patience is light.   Gratitude is its twin.' },
];

test('requests: a source is required, pages are bounded, a question is needed for Q&A', () => {
  assert.deepEqual(validateAssistantRequest({ task: 'guide', question: '', language: 'ar', allowRemote: false, notes: ['a'], books: [] }).notes, ['a']);
  assert.throws(() => validateAssistantRequest({ task: 'qa', question: ' ', language: 'en', allowRemote: false, notes: ['a'], books: [] }), /invalid-request/u);
  assert.throws(() => validateAssistantRequest({ task: 'guide', language: 'en', allowRemote: false, notes: [], books: [] }), /invalid-request/u);
  assert.throws(() => validateAssistantRequest({ task: 'guide', language: 'en', allowRemote: false, notes: [], books: [{ id: 'b', from: 1, to: 60 }] }), /invalid-request/u);
  assert.throws(() => validateAssistantRequest({ task: 'hack', language: 'en', allowRemote: false, notes: ['a'], books: [] }), /invalid-request/u);
  assert.throws(() => validateAssistantRequest({ task: 'guide', language: 'en', allowRemote: 'yes', notes: ['a'], books: [] }), /invalid-request/u);
  assert.throws(() => validateAssistantRequest({ task: 'guide', language: 'en', allowRemote: false, notes: ['../x'], books: [] }), /invalid-request/u);
});

test('ayahs and hadith are sources by their study link target only', () => {
  const base = { task: 'guide', question: '', language: 'ar', allowRemote: false, notes: [], books: [] };
  const request = validateAssistantRequest({ ...base, passages: [{ target: 'quran:hafs:2:153', label: 'البقرة 153' }, { target: 'sunnah:Bukhari:1:1', label: 'صحيح البخاري 1\n[[x]]' }] });
  assert.deepEqual(request.passages, [{ target: 'quran:hafs:2:153', label: 'البقرة 153' }, { target: 'sunnah:Bukhari:1:1', label: 'صحيح البخاري 1 x' }]);
  // Text is never accepted from the renderer, only a target and a label.
  assert.equal('text' in request.passages[0], false);
  assert.equal(validateAssistantRequest({ ...base, passages: [{ target: 'quran:hafs:2:1', label: '' }] }).passages[0].label, 'quran:hafs:2:1');
  assert.throws(() => validateAssistantRequest({ ...base, passages: [{ target: 'note:a', label: 'x' }] }), /invalid-request/u);
  assert.throws(() => validateAssistantRequest({ ...base, passages: [{ target: 'sunnah:unknown:1:1', label: 'x' }] }), /invalid-request/u);
  assert.throws(() => validateAssistantRequest({ ...base, passages: Array.from({ length: 21 }, (_, i) => ({ target: `quran:hafs:2:${i + 1}`, label: 'x' })) }), /invalid-request/u);
  assert.equal(passageKind('quran:hafs:2:1-50'), 'quran');
  assert.equal(passageKind('quran:hafs:2:1-51'), null, 'at most 50 ayahs');
  assert.equal(passageKind('sunnah:Muslim:3:abc'), 'hadith');
  assert.equal(passageKind('book:b#p=2'), null);
  assert.deepEqual(['book:b#p=2', 'quran:hafs:1:1', 'sunnah:Bukhari:1:1', 'note:a'].map(cardSourceKind), ['book', 'quran', 'hadith', 'note']);
});

test('only a local Ollama runs without consent', () => {
  assert.equal(isLocalProvider({ provider: 'ollama', ollamaEndpoint: 'http://127.0.0.1:11434' }), true);
  assert.equal(isLocalProvider({ provider: 'ollama', ollamaEndpoint: 'http://192.168.1.5:11434' }), false);
  assert.equal(isLocalProvider({ provider: 'openai', ollamaEndpoint: 'http://127.0.0.1:11434' }), false);
  assert.equal(isLocalProvider({ provider: 'ollama', ollamaEndpoint: 'http://user:pw@127.0.0.1:11434' }), false);
});

test('sources fit a budget; the prompt names the task and the exact-quote rule', () => {
  const fitted = budgetSources(sources, 20);
  assert.equal(fitted.limited, true);
  assert.equal(fitted.sources.length, 1);
  assert.equal(budgetSources(sources).limited, false);
  assert.match(assistantSystemPrompt('cards', 'ar'), /Arabic[\s\S]*flashcards[\s\S]*"cards"/u);
  assert.match(assistantSystemPrompt('qa', 'en'), /exactly/u);
});

test('answers are shown only when every quote is really in its source', () => {
  const good = validateAssistantAnswer(JSON.stringify({ answer: 'الصبر ضياء', abstained: false, citations: [{ source: 'S1', quote: 'الصبر ضياء' }, { source: 'S2', quote: 'Patience is light. Gratitude' }] }), sources, 'qa');
  assert.deepEqual(good.citations.map(citation => citation.target), ['note:a', 'book:b1#p=4']);
  assert.equal(quoteFound('Patience is light. Gratitude', sources[1].text), true, 'spacing differences are allowed');
  assert.throws(() => validateAssistantAnswer(JSON.stringify({ answer: 'x', abstained: false, citations: [{ source: 'S1', quote: 'الصبر نور' }] }), sources, 'qa'), /invalid-output/u, 'a paraphrase is refused');
  assert.throws(() => validateAssistantAnswer(JSON.stringify({ answer: 'x', abstained: false, citations: [{ source: 'S9', quote: 'الصبر ضياء' }] }), sources, 'qa'), /invalid-output/u);
  assert.throws(() => validateAssistantAnswer(JSON.stringify({ answer: 'x', abstained: false, citations: [] }), sources, 'qa'), /invalid-output/u, 'an uncited answer is refused');
  assert.throws(() => validateAssistantAnswer('not json', sources, 'qa'), /invalid-output/u);
  assert.equal(validateAssistantAnswer('```json\n{"answer":"","abstained":true,"citations":[]}\n```', sources, 'qa').abstained, true);
  const cards = validateAssistantAnswer(JSON.stringify({ answer: '', abstained: false, citations: [], cards: [{ front: 'ما الصبر؟', back: 'ضياء', source: 'S1', quote: 'الصبر ضياء' }] }), sources, 'cards');
  assert.deepEqual(cards.cards.map(card => [card.front, card.target]), [['ما الصبر؟', 'note:a']]);
  assert.throws(() => validateAssistantAnswer(JSON.stringify({ answer: '', abstained: false, citations: [], cards: [{ front: 'q', back: 'a', source: 'S1', quote: 'غير موجود' }] }), sources, 'cards'), /invalid-output/u);
});

test('an answer saved as a note keeps its citations as live links', () => {
  const answer = validateAssistantAnswer(JSON.stringify({ answer: 'الجواب', abstained: false, citations: [{ source: 'S2', quote: 'Patience is light.' }, { source: 'S2', quote: 'Patience is light.' }] }), sources, 'qa');
  assert.equal(answerAsNote(answer, { sources: 'المصادر', question: 'السؤال' }, 'ما الصبر؟'), '> السؤال ما الصبر؟\n\nالجواب\n\n## المصادر\n- [[book:b1#p=4|رياض الصالحين (4)]]: «Patience is light.»\n');
});
