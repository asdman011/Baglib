import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { parseSlashCommand } from '../../src/shared/slash-command';
import { parsePersonTarget, studyLinkText, validStudyTarget } from '../../src/shared/study-notes';
import {
  defaultWikipediaLang,
  formatDictionaryQuote,
  formatWikipediaQuote,
  searchSlashDatasets,
  slashResultInsert,
  type SlashSearchInput,
} from '../../src/renderer/utils/slash-search';
import { parseWikipediaSearchResponse, WikipediaService } from '../../src/main/services/dictionary/wikipedia.service';
import { searchPeople } from '../../src/main/services/person-search';

const baseInput: SlashSearchInput = {
  scope: null,
  query: '',
  notes: [],
  books: [],
};

describe('KEY-432: new slash scopes parsing', () => {
  it('parses dictionary aliases in English and Arabic', () => {
    for (const cmd of ['/dictionary كتب', '/معجم كتب', '/قاموس كتب', '/المُعْجَم كتب']) {
      const parsed = parseSlashCommand(cmd);
      assert.equal(parsed?.scope, 'dictionary');
      assert.equal(parsed?.query, 'كتب');
    }
  });

  it('parses people aliases in English and Arabic', () => {
    for (const cmd of ['/people ابن', '/scholars ابن', '/narrators ابن', '/علماء ابن', '/رواة ابن', '/رجال ابن', '/أعلام ابن']) {
      const parsed = parseSlashCommand(cmd);
      assert.equal(parsed?.scope, 'people');
      assert.equal(parsed?.query, 'ابن');
    }
  });

  it('parses wikipedia aliases in English and Arabic', () => {
    for (const cmd of ['/wikipedia البخاري', '/wiki البخاري', '/ويكيبيديا البخاري']) {
      const parsed = parseSlashCommand(cmd);
      assert.equal(parsed?.scope, 'wikipedia');
      assert.equal(parsed?.query, 'البخاري');
    }
  });
});

describe('KEY-432: dictionary, people, and wikipedia result formatting & search', () => {
  it('groups dictionary results by dictionary name and formats quotation with source', async () => {
    const found = await searchSlashDatasets({
      ...baseInput,
      scope: 'dictionary',
      query: 'كتب',
      searchDictionary: async () => [
        { dictId: 'lisan', dictTitle: 'لسان العرب', dictFormat: 'arabic-lexicons', headword: 'كَتَبَ', matchedCandidate: 'كتب', definitionHtml: '', definitionText: 'الجمع والخط' },
        { dictId: 'sihah', dictTitle: 'الصحاح', dictFormat: 'arabic-lexicons', headword: 'كتب', matchedCandidate: 'كتب', definitionHtml: '', definitionText: 'الكتاب معروف' },
        { dictId: 'lisan', dictTitle: 'لسان العرب', dictFormat: 'arabic-lexicons', headword: 'كِتَاب', matchedCandidate: 'كتب', definitionHtml: '', definitionText: 'ما يُكتب فيه' },
      ],
    });
    assert.deepEqual(found.map(r => r.groupLabel), ['لسان العرب', 'لسان العرب', 'الصحاح']);
    const inserted = slashResultInsert(found[0]!);
    assert.equal(inserted, formatDictionaryQuote('لسان العرب', 'كَتَبَ', 'الجمع والخط'));
    assert.ok(inserted.includes('> الجمع والخط'));
    assert.ok(inserted.includes('لسان العرب: كَتَبَ'));
  });

  it('validates person targets and formats people results as BagLib links', async () => {
    assert.equal(validStudyTarget('person:scholar:a1'), true);
    assert.equal(validStudyTarget('person:narrator:42'), true);
    assert.equal(validStudyTarget('person:card:c1'), true);
    assert.deepEqual(parsePersonTarget('person:narrator:42'), { kind: 'narrator', id: '42' });

    const found = await searchSlashDatasets({
      ...baseInput,
      scope: 'people',
      query: 'أحمد',
      searchPeople: async () => [
        { id: 'a1', target: 'person:scholar:a1', name: 'الإمام أحمد', role: 'scholar', detail: '241 هـ' },
        { id: '42', target: 'person:narrator:42', name: 'أحمد بن حنبل', role: 'narrator', detail: 'ثقة حافظ' },
      ],
    });
    assert.equal(found.length, 2);
    assert.equal(found[0]!.role, 'scholar');
    assert.equal(found[1]!.role, 'narrator');
    assert.equal(slashResultInsert(found[0]!), studyLinkText('person:scholar:a1', 'الإمام أحمد'));
    assert.equal(slashResultInsert(found[1]!), studyLinkText('person:narrator:42', 'أحمد بن حنبل'));
  });

  it('does not query Wikipedia when scope is null, only when wikipedia scope is picked', async () => {
    let wikiCalled = false;
    await searchSlashDatasets({
      ...baseInput,
      scope: null,
      query: 'البخاري',
      searchWikipedia: async () => {
        wikiCalled = true;
        return { ok: true, lang: 'ar', items: [] };
      },
    });
    assert.equal(wikiCalled, false);

    const found = await searchSlashDatasets({
      ...baseInput,
      scope: 'wikipedia',
      query: 'البخاري',
      lang: 'en',
      searchWikipedia: async (q, lang) => {
        wikiCalled = true;
        assert.equal(q, 'البخاري');
        assert.equal(lang, 'ar');
        return {
          ok: true,
          lang: 'ar',
          items: [{ title: 'محمد بن إسماعيل البخاري', summary: 'إمام حافظ ومحدث.', url: 'https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D8%A8%D8%AE%D8%A7%D8%B1%D9%8A', lang: 'ar' }],
        };
      },
    });
    assert.equal(wikiCalled, true);
    assert.equal(found.length, 1);
    const inserted = slashResultInsert(found[0]!);
    assert.equal(inserted, formatWikipediaQuote('محمد بن إسماعيل البخاري', 'إمام حافظ ومحدث.', 'https://ar.wikipedia.org/wiki/%D8%A7%D9%84%D8%A8%D8%AE%D8%A7%D8%B1%D9%8A'));
    assert.ok(inserted.includes('**محمد بن إسماعيل البخاري**'));
    assert.ok(inserted.includes('إمام حافظ ومحدث.'));
    assert.ok(inserted.includes('https://ar.wikipedia.org/'));
  });

  it('defaults Wikipedia language to Arabic for Arabic query or Arabic UI, else English', () => {
    assert.equal(defaultWikipediaLang('البخاري', 'en'), 'ar');
    assert.equal(defaultWikipediaLang('Bukhari', 'ar'), 'ar');
    assert.equal(defaultWikipediaLang('Bukhari', 'en'), 'en');
  });

  it('propagates offline status for Wikipedia when offline', async () => {
    const found = await searchSlashDatasets({
      ...baseInput,
      scope: 'wikipedia',
      query: 'Bukhari',
      lang: 'en',
      searchWikipedia: async () => ({ ok: false, error: 'offline', lang: 'en', items: [] }),
    });
    assert.equal(found.length, 1);
    assert.equal(found[0]!.offline, true);
  });
});

describe('KEY-432: Wikipedia response parsing & mock fetch', () => {
  it('parses MediaWiki query.pages responses sorted by index', () => {
    const items = parseWikipediaSearchResponse({
      query: {
        pages: {
          '2': { index: 2, title: 'Second', extract: 'Second   summary', fullurl: 'https://en.wikipedia.org/wiki/Second' },
          '1': { index: 1, title: 'First', extract: 'First summary', fullurl: 'https://en.wikipedia.org/wiki/First' },
        },
      },
    }, 'en', 5);
    assert.deepEqual(items, [
      { title: 'First', summary: 'First summary', url: 'https://en.wikipedia.org/wiki/First', lang: 'en' },
      { title: 'Second', summary: 'Second summary', url: 'https://en.wikipedia.org/wiki/Second', lang: 'en' },
    ]);
  });

  it('parses opensearch tuple responses', () => {
    const items = parseWikipediaSearchResponse([
      'كتب',
      ['كتاب'],
      ['مؤلف مطبوع'],
      ['https://ar.wikipedia.org/wiki/كتاب'],
    ], 'ar', 5);
    assert.deepEqual(items, [
      { title: 'كتاب', summary: 'مؤلف مطبوع', url: 'https://ar.wikipedia.org/wiki/كتاب', lang: 'ar' },
    ]);
  });

  it('validates inputs and handles offline errors in WikipediaService.searchArticles', async () => {
    const service = new WikipediaService();
    const invalidLang = await service.searchArticles('test', 'fr');
    assert.equal(invalidLang.ok, false);
    if (!invalidLang.ok) assert.equal(invalidLang.error, 'invalid-request');

    const tooLong = await service.searchArticles('a'.repeat(201), 'en');
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) assert.equal(tooLong.error, 'invalid-request');

    const offline = await service.searchArticles('Bukhari', 'en', 5, async () => {
      throw new TypeError('fetch failed');
    });
    assert.equal(offline.ok, false);
    if (!offline.ok) assert.equal(offline.error, 'offline');

    const ok = await service.searchArticles('Bukhari', 'en', 5, async (url) => {
      assert.ok(String(url).startsWith('https://en.wikipedia.org/w/api.php?'));
      return new Response(JSON.stringify({
        query: { pages: { '1': { index: 1, title: 'Al-Bukhari', extract: 'Islamic scholar.', fullurl: 'https://en.wikipedia.org/wiki/Al-Bukhari' } } },
      }), { status: 200 });
    });
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.items[0]?.title, 'Al-Bukhari');
  });
});

describe('KEY-432: searchPeople across authors, person notes, and narrators', () => {
  it('searches scholars and narrators with Arabic normalization and deduplication', async () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE author (id TEXT PRIMARY KEY, name TEXT, birth_year TEXT, death_year TEXT, bio TEXT);
      CREATE TABLE card_note (id TEXT PRIMARY KEY, note_type_id TEXT, fields_json TEXT, copied_from_note_id TEXT, source_ref TEXT);
      CREATE TABLE card_detail (id TEXT PRIMARY KEY, note_id TEXT, knowledge_id TEXT);
      CREATE TABLE knowledge (id TEXT PRIMARY KEY, deleted_at TEXT);
    `);
    db.prepare(`INSERT INTO author VALUES (?, ?, ?, ?, ?)`).run('auth1', 'الإمام الشافعي', '150', '204', 'فقيه');
    db.prepare(`INSERT INTO author VALUES (?, ?, ?, ?, ?)`).run('auth2', 'غير معروف', null, null, null);
    db.prepare(`INSERT INTO knowledge VALUES (?, NULL)`).run('k1');
    db.prepare(`INSERT INTO card_note VALUES (?, 'stock-person', ?, NULL, ?)`).run('cn1', JSON.stringify({ Name: 'ابن تيمية', Era: '728' }), 'author:auth_extra');
    db.prepare(`INSERT INTO card_detail VALUES ('cd1', 'cn1', 'k1')`).run();

    const results = await searchPeople(db, 'الشافعي', {
      searchNarrators: async () => [{ id: '99', name: 'أبو هريرة', detail: 'صحابي' }],
    });
    assert.equal(results.some(r => r.target === 'person:scholar:auth1' && r.role === 'scholar'), true);
    assert.equal(results.some(r => r.target === 'person:narrator:99' && r.role === 'narrator'), true);
    assert.equal(results.some(r => r.name === 'غير معروف'), false);

    const diacriticSearch = await searchPeople(db, 'تيمية');
    assert.equal(diacriticSearch.some(r => r.name === 'ابن تيمية'), true);
    db.close();
  });
});
