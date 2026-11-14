import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { searchSlashDatasets, slashResultLink, type SlashSearchInput } from '../../src/renderer/utils/slash-search';
import { studyLinkText } from '../../src/shared/study-notes';
import { searchCorpus } from '../../src/renderer/utils/corpus-lookup';
import { parseSlashCommand, SLASH_SCOPES } from '../../src/shared/slash-command';
const input: SlashSearchInput = { scope: null, query: '', notes: [{ id: 'n', title: 'عِلْم Mixed', content: 'content', aliases: ['Learning'], tags: [], createdAt: '', updatedAt: '' }], books: [{ id: 'b', sourceId: 's', title: 'علم Book', workType: 'book' }, { id: 'l', title: 'علم Lecture', workType: 'lecture' }, { id: 'v', title: 'Video', workType: 'video' }, { id: 'p', title: 'Podcast', workType: 'podcast' }] };
describe('slash dataset search', () => {
  it('lists notes for an empty scope and inserts the same link as the picker', async () => {
    const result = await searchSlashDatasets({ ...input, scope: 'notes' });
    assert.equal(result.length, 1);
    assert.equal(slashResultLink(result[0]), studyLinkText('note:n', 'عِلْم Mixed'));
  });
  it('filters books separately from lecture, podcast and video Works and preserves Source identity', async () => {
    const books = await searchSlashDatasets({ ...input, scope: 'books' });
    assert.deepEqual(books.map(item => item.target), ['book:b@s']);
    const media = await searchSlashDatasets({ ...input, scope: 'lectures' });
    assert.deepEqual(media.map(item => item.target), ['book:l', 'book:v', 'book:p']);
  });
  it('normalizes Arabic queries without changing canonical labels', async () => {
    const found = await searchSlashDatasets({ ...input, scope: 'notes', query: 'علم' });
    assert.equal(found[0].label, 'عِلْم Mixed');
    assert.equal((await searchSlashDatasets({ ...input, scope: 'notes', query: 'Learning' })).length, 1);
  });
  it('routes scoped queries only to their corpus and preserves corpus link targets', async () => {
    for (const [scope, kind, target] of [['quran', 'quran', 'quran:hafs:2:255'], ['sunnah', 'hadith', 'sunnah:Bukhari:1:1'], ['albayan', 'poem', 'poetry:ashaar:1:0:0']] as const) {
      const found = await searchSlashDatasets({ ...input, scope, query: 'علم', searchCorpus: async (kinds, query) => {
        assert.deepEqual(kinds, [kind]); assert.equal(query, 'علم');
        return [{ kind, target, label: 'علم', snippet: 'text', link: studyLinkText(target, 'علم'), quote: '' }];
      } });
      assert.equal(found.length, 1); assert.equal(found[0].scope, scope);
      assert.equal(slashResultLink(found[0]), studyLinkText(target, 'علم'));
    }
  });
  it('groups free results in dataset order and caps each dataset', async () => {
    const found = await searchSlashDatasets({ ...input, query: 'علم', notes: Array.from({ length: 10 }, (_, i) => ({ ...input.notes[0], id: String(i) })), searchCorpus: async () => [
      { kind: 'poem', target: 'poetry:ashaar:1:0:0', label: 'علم', snippet: '', link: '', quote: '' },
      { kind: 'hadith', target: 'sunnah:Bukhari:1:1', label: 'علم', snippet: '', link: '', quote: '' },
      { kind: 'quran', target: 'quran:hafs:2:255', label: 'علم', snippet: '', link: '', quote: '' },
    ] });
    assert.deepEqual(found.map(item => item.scope), ['quran', 'sunnah', 'albayan', 'notes', 'notes', 'notes', 'books', 'lectures']);
  });
  it('ranks title matches over body-only matches with stable ordering', async () => {
    const found = await searchSlashDatasets({ ...input, scope: 'notes', query: 'علم', notes: [{ ...input.notes[0], id: 'body', title: 'Other', content: 'علم' }, input.notes[0]] });
    assert.deepEqual(found.map(item => item.target), ['note:n', 'note:body']);
  });
  it('does not dispatch remote work after invalidation and discards late results', async () => {
    let called = false;
    await searchSlashDatasets({ ...input, scope: 'quran', query: '2:255', stale: () => true, searchCorpus: async () => { called = true; return []; } });
    assert.equal(called, false);
    let stale = false;
    const found = await searchSlashDatasets({ ...input, query: 'علم', stale: () => stale, searchCorpus: async () => { stale = true; return []; } });
    assert.deepEqual(found, []);
  });
  it('keeps local results when an unavailable remote corpus rejects', async () => {
    const found = await searchSlashDatasets({ ...input, query: 'علم', searchCorpus: async () => { throw Error('missing'); } });
    assert.deepEqual(found.map(item => item.scope), ['notes', 'books', 'lectures']);
  });
  it('accepts every English scope and Arabic alias in either language', () => {
    const aliases = ['القران', 'السنة', 'البيان', 'ملاحظات', 'كتب', 'محاضرات'];
    SLASH_SCOPES.forEach((scope, i) => {
      assert.equal(parseSlashCommand(`/${scope} علم`)?.scope, scope);
      assert.equal(parseSlashCommand(`/${aliases[i]} علم`)?.scope, scope);
    });
  });
  it('does not conflate taa marbuta and haa in canonical search matching', async () => {
    assert.deepEqual(await searchSlashDatasets({ ...input, scope: 'notes', query: 'مدرسه', notes: [{ ...input.notes[0], title: 'مدرسة' }] }), []);
  });
});

describe('slash Quran service integration', () => {
  it('searches installed translations in the chosen profile for English queries', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let query: unknown;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { quran: {
      readerCatalog: async () => ({ ok: true, data: { sources: [
        { id: 'script', kind: 'script', profile: 'hafs' },
        { id: 'english', kind: 'translation', profile: 'hafs' },
        { id: 'other-profile', kind: 'translation', profile: 'warsh' },
      ] } }),
      searchAyahs: async (value: unknown) => { query = value; return { ok: true, data: [{ surah: 1, ayah: 1, text: 'In the name of Allah' }] }; },
    } } } });
    try {
      const found = await searchCorpus(['quran'], 'Allah', id => id);
      assert.deepEqual(query, { script: 'script', text: 'Allah', translations: ['english'] });
      assert.equal(found[0].link, studyLinkText('quran:hafs:1:1', '1:1'));
    } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); }
  });
  it('jumps to an Arabic-Indic reference through the reader without running text search', async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { quran: {
      readerCatalog: async () => ({ ok: true, data: { sources: [{ id: 'script', kind: 'script', profile: 'hafs' }] } }),
      read: async () => ({ ok: true, data: { ayahs: [{ number: 255, words: [{ text: 'text', marker: false }] }] } }),
      searchAyahs: async () => { throw Error('reference must use reader'); },
    } } } });
    try {
      const found = await searchCorpus(['quran'], '\u0662:\u0662\u0665\u0665'.replace(/\\u([0-9a-f]{4})/gu, (_, code) => String.fromCharCode(parseInt(code, 16))), id => id);
      assert.equal(found[0].link, studyLinkText('quran:hafs:2:255', '2:255'));
    } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); }
  });
});
