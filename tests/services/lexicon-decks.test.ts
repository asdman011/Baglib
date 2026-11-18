/**
 * KEY-400 unit tests:
 * - Stage 1: lexicon import, paging across >200 headwords, re-import keeping FSRS schedule;
 * - Stage 2: reversed translation cards (`stock-basic-reversed` when `source_lang !== target_lang`);
 * - Stage 3: quick-add from lookups, remembering last deck in settings, and refusing duplicates ("already in deck");
 * - Stage 4: Quranic root cards (ishtiqaq) with and without an installed lexicon source, plus root deck generation;
 * - Stage 5: tafsir cards from book highlights/comments and Quran commentary notes, keeping schedule on regenerate;
 * - Guardrail: no-hifz test proving root and quick-add cards never contain a full ayah as the answer;
 * - HTML stripping: no `<script>`, `<style>`, `<iframe>`, or `on*` attributes survive.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { SrsService } from '../../src/main/services/srs';
import { DictionaryService } from '../../src/main/services/dictionary/dictionary.service';
import {
  LexiconDeckService,
  type LexiconReaders,
  stripDictionaryHtml,
  formatDashedRoot,
  isSafeNonHifzVocabularyWord,
  validateLexiconImportInput,
  validateQuickAddLookupInput,
  validateRootCardInput,
  validateRootDeckInput,
  validateTafsirDeckInput,
} from '../../src/main/services/lexicon-decks';
import type { DictionaryItem } from '../../src/shared/types/dictionary';
import type { QuranFrequency, QuranRootWordsResult } from '../../src/shared/types/quran';

function createFixture(options?: { withArabicLexicon?: boolean }) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);

  const dicts: DictionaryItem[] = [
    {
      id: 'dict-mono',
      title: 'Al-Mu’jam Al-Wasit',
      format: 'stardict',
      sourcePath: '/fake/mono.ifo',
      sourceLang: 'ar',
      targetLang: 'ar',
      entryCount: 450,
      isEnabled: true,
      createdAt: '2026-11-18T00:00:00.000Z',
    },
    {
      id: 'dict-bilingual',
      title: 'English-Dutch FreeDict',
      format: 'stardict',
      sourcePath: '/fake/eng-nld.ifo',
      sourceLang: 'en',
      targetLang: 'nl',
      entryCount: 10,
      isEnabled: true,
      createdAt: '2026-11-18T00:00:00.000Z',
    },
  ];

  const insertDict = db.prepare(
    `INSERT INTO dictionaries (id, title, format, source_path, source_lang, target_lang, entry_count, is_enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );
  for (const d of dicts) {
    insertDict.run(d.id, d.title, d.format, d.sourcePath, d.sourceLang, d.targetLang, d.entryCount, d.createdAt);
  }

  const definitions = new Map<string, string>();
  const insertHw = db.prepare(
    `INSERT INTO headword_index (dict_id, headword, normalized_headword, offset, size) VALUES (?, ?, ?, 0, 10)`
  );

  // Seed 450 monolingual headwords to exercise multi-page batching (page size = 200)
  db.transaction(() => {
    for (let i = 1; i <= 450; i++) {
      const hw = `كلمة_${String(i).padStart(3, '0')}`;
      insertHw.run('dict-mono', hw, hw);
      definitions.set(`dict-mono:${hw}`, `<p>معنى الكلمة رقم <b>${i}</b> في المعجم.</p><script>evil()</script>`);
    }
    for (const [hw, nl] of [
      ['book', '<div>boek</div>'],
      ['water', '<div>water; vloeistof</div>'],
      ['light', '<div>licht</div>'],
    ] as const) {
      insertHw.run('dict-bilingual', hw, hw);
      definitions.set(`dict-bilingual:${hw}`, nl);
    }
  })();

  if (options?.withArabicLexicon) {
    insertHw.run('dict-mono', 'أله', 'اله');
    definitions.set(
      'dict-mono:أله',
      '<div>أَلِهَ يَأْلَهُ إِلاهَةً: عَبَدَ، ومنه لفظ الجلالة (الله) أي المألوه المعبود بحق.</div>'
    );
  }

  const readers: LexiconReaders = {
    listDictionaries: () => dicts,
    readEntry: async (dict, headword) => definitions.get(`${dict.id}:${headword}`) ?? null,
    lookupDictionary: async word => {
      if (options?.withArabicLexicon && (word === 'أله' || word === 'اله')) {
        const def = definitions.get('dict-mono:أله')!;
        return [
          {
            dictId: 'dict-mono',
            dictTitle: 'Al-Mu’jam Al-Wasit',
            headword: 'أله',
            definitionHtml: def,
            definitionText: stripDictionaryHtml(def),
          },
        ];
      }
      return [];
    },
    quranFrequency: async query => {
      const all: QuranFrequency['rows'] = [
        { text: 'أ ل ه', count: 2851, stated: 2851 },
        { text: 'ر ح م', count: 339, stated: 339 },
        { text: 'ع ل م', count: 854, stated: 854 },
      ];
      const rows = query.surah === 1 ? all.slice(0, 2) : all.slice(0, query.limit ?? 10);
      return { family: 'root', total: 4044, distinct: rows.length, rows };
    },
    quranRootWords: async root => {
      const clean = root.replace(/\s+/gu, '');
      if (clean === 'أله' || clean === 'اله') {
        const res: QuranRootWordsResult = {
          root: 'أ ل ه',
          total: 2851,
          words: [
            { word: 'ٱللَّهِ', count: 2395, meaning: 'Allah' },
            { word: 'إِلَٰهٌ', count: 147, meaning: 'deity / god' },
            { word: 'ٱللَّهُمَّ', count: 5, meaning: 'O Allah' },
          ],
        };
        return res;
      }
      if (clean === 'رحم') {
        return {
          root: 'ر ح م',
          total: 339,
          words: [
            { word: 'ٱلرَّحْمَٰنِ', count: 57, meaning: 'the Most Gracious' },
            { word: 'ٱلرَّحِيمِ', count: 114, meaning: 'the Most Merciful' },
            { word: 'رَحْمَةٌ', count: 79, meaning: 'mercy' },
          ],
        };
      }
      return {
        root,
        total: 12,
        words: [{ word: 'عِلْمٌ', count: 12, meaning: 'knowledge' }],
      };
    },
    quranAyahTafsir: async (surah, ayah) => ({
      title: 'تفسير ابن كثير',
      text: `<p>تفسير الآية ${surah}:${ayah} في بيان التوحيد والعبادة الخالصة لله وحده.</p>`,
    }),
  };

  return {
    db,
    definitions,
    service: new LexiconDeckService(db, readers),
    srs: new SrsService(db, () => new Date('2026-11-18T10:00:00.000Z')),
  };
}

test('HTML stripping: removes script, style, iframe and event attributes, keeping clean plain text', () => {
  const dirty = `
    <style>.hidden { display: none; } body { color: red; }</style>
    <script>window.pwned = true; alert("xss");</script>
    <div onclick="alert(1)" onmouseover="steal()">
      <b>باب الألف</b><br>
      <p>الكلمة الأولى: معنى واضح.</p>
      <iframe src="https://evil.example"></iframe>
      <img src="x" onerror="alert(2)">
      <a href="javascript:alert(3)" onclick="bad()">رابط</a>
    </div>
  `;
  const clean = stripDictionaryHtml(dirty);
  assert.ok(!clean.includes('window.pwned'), 'no script body');
  assert.ok(!clean.includes('display: none'), 'no style body');
  assert.ok(!/on\w+\s*=/iu.test(clean), 'no on* event attributes');
  assert.ok(!/<script|<style|<iframe|<img|<a\b/iu.test(clean), 'no raw HTML tags');
  assert.ok(clean.includes('باب الألف'), 'keeps heading text');
  assert.ok(clean.includes('الكلمة الأولى: معنى واضح.'), 'keeps paragraph text');
});

test('Stage 1: lexicon import pages through >200 headwords, and re-importing keeps existing FSRS schedule', async () => {
  const f = createFixture();
  try {
    const input = validateLexiconImportInput({
      dictId: 'dict-mono',
      deckName: 'مفردات الوسيط',
      filterMode: 'prefix',
      prefix: 'كلمة_',
      limit: 420,
      language: 'ar',
    });

    let pageYields = 0;
    const first = await f.service.importDictionaryDeck(input, async () => {
      pageYields += 1;
    });

    assert.equal(first.noteTypeId, 'stock-basic', 'monolingual ar->ar uses Basic note type');
    assert.equal(first.reversed, false);
    assert.equal(first.totalMatched, 420);
    assert.equal(first.added, 420);
    assert.equal(first.skipped, 0);
    assert.ok(pageYields >= 2, '420 entries across 200-entry pages yields between batches');

    const sampleNote = f.db
      .prepare(`SELECT id, fields_json FROM card_note WHERE source_ref = 'lexicon:dict-mono:كلمة_001'`)
      .get() as { id: string; fields_json: string };
    const fields = JSON.parse(sampleNote.fields_json) as { Front: string; Back: string };
    assert.ok(fields.Front.includes('كلمة_001'));
    assert.ok(fields.Back.includes('معنى الكلمة رقم 1 في المعجم.'));
    assert.ok(fields.Back.includes('المصدر: Al-Mu’jam Al-Wasit'));
    assert.ok(!fields.Back.includes('evil()'), 'stripped script tag from definition');

    // Review a card so its FSRS state advances from 'new'
    const card = f.srs.queue(first.deckId).cards[0];
    assert.ok(card);
    f.srs.grade({ id: card.id, revision: card.revision, rating: 3, durationMs: 400, deckId: first.deckId });
    const stateBefore = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(card.id);

    // Re-import with a slightly larger limit (450): existing 420 are skipped (schedule intact), 30 new are added
    const second = await f.service.importDictionaryDeck(
      validateLexiconImportInput({
        dictId: 'dict-mono',
        deckId: first.deckId,
        filterMode: 'prefix',
        prefix: 'كلمة_',
        limit: 450,
        language: 'ar',
      })
    );
    assert.equal(second.added, 30);
    assert.equal(second.skipped, 420);
    const stateAfter = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(card.id);
    assert.deepEqual(stateAfter, stateBefore, 're-importing preserves existing FSRS schedule');
  } finally {
    f.db.close();
  }
});

test('Stage 1 & 2: real Readest StarDict fixture imports and creates Basic (and reversed) translation cards when source_lang !== target_lang', async () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrations);
  try {
    const dictService = new DictionaryService(db);
    const ifoPath = path.resolve(
      'repos/readest/readest-main/apps/readest-app/src/__tests__/fixtures/data/dicts/eng-nld.ifo'
    );
    const imported = await dictService.importDictionary({
      sourcePath: ifoPath,
      title: 'English-Dutch FreeDict',
      sourceLang: 'en',
      targetLang: 'nl',
    });
    assert.ok(imported.entryCount > 1000, 'real StarDict dictionary indexed');

    const service = new LexiconDeckService(db, {
      listDictionaries: () => dictService.listDictionaries(),
      readEntry: (d, hw) => dictService.readEntry(d, hw),
      lookupDictionary: async w => (await dictService.lookup(w, { includeWikipedia: false })).entries,
      quranFrequency: async () => ({ family: 'root', total: 0, distinct: 0, rows: [] }),
      quranRootWords: async r => ({ root: r, total: 0, words: [] }),
    });

    const res = await service.importDictionaryDeck(
      validateLexiconImportInput({
        dictId: imported.id,
        deckName: 'English-Dutch Vocab',
        filterMode: 'prefix',
        prefix: 'a',
        limit: 15,
        language: 'en',
      })
    );
    assert.equal(res.reversed, true, 'en -> nl automatically enables reversed cards');
    assert.equal(res.noteTypeId, 'stock-basic-reversed');
    assert.equal(res.added, 15);

    const cardCount = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM deck_card WHERE deck_id = ?`)
        .get(res.deckId) as { n: number }
    ).n;
    assert.equal(cardCount, 30, '15 notes x 2 directions (word->translation and translation->word) = 30 cards');
  } finally {
    db.close();
  }
});

test('Stage 3: quick-add from dictionary and Quran word lookups remembers last deck and prevents duplicates', () => {
  const f = createFixture();
  try {
    const customDeckId = (
      f.db
        .prepare(
          `INSERT INTO deck (id, name, parent_id, kind, created_at, updated_at) VALUES ('my-vocab', 'My Vocab', NULL, 'normal', '2026-11-18', '2026-11-18')`
        )
        .run(),
      'my-vocab'
    );

    const first = f.service.quickAddLookup(
      validateQuickAddLookupInput({
        word: 'epistemology',
        meaning: '<b>theory of knowledge</b><script>bad()</script>',
        source: 'Oxford Philosophy Dictionary',
        kind: 'dictionary',
        deckId: customDeckId,
        reversed: true,
        language: 'en',
      })
    );
    assert.equal(first.duplicate, false);
    assert.equal(first.deckId, customDeckId);
    assert.equal(f.service.getLastQuickAddDeckId(), customDeckId, 'last chosen deck is remembered in settings');

    // Repeating the same word and meaning in the same deck is not added twice
    const dup = f.service.quickAddLookup(
      validateQuickAddLookupInput({
        word: 'epistemology',
        meaning: 'theory of knowledge',
        source: 'Oxford Philosophy Dictionary',
        kind: 'dictionary',
        deckId: null, // uses remembered deck
        reversed: true,
        language: 'en',
      })
    );
    assert.equal(dup.duplicate, true, 'duplicate detected');
    assert.equal(dup.noteId, first.noteId);

    // Quran word lookup quick-add with sura:ayah as source
    const quranAdd = f.service.quickAddLookup(
      validateQuickAddLookupInput({
        word: 'ٱلصَّمَدُ',
        meaning: 'The Eternal Refuge',
        source: '112:2',
        kind: 'quran-word',
        deckId: null,
        reversed: true,
        language: 'en',
      })
    );
    assert.equal(quranAdd.duplicate, false);
    assert.equal(quranAdd.deckId, customDeckId);
    const detail = f.db
      .prepare(`SELECT source_kind, source_label, back FROM card_detail WHERE note_id = ? ORDER BY ord ASC`)
      .all(quranAdd.noteId) as Array<{ source_kind: string; source_label: string; back: string }>;
    assert.equal(detail.length, 2, 'word <-> meaning reversed cards');
    assert.equal(detail[0].source_kind, 'quran');
    assert.equal(detail[0].source_label, '112:2');
    assert.ok(detail[0].back.includes('source: 112:2'));
  } finally {
    f.db.close();
  }
});

test('Stage 4: Quranic root cards (ishtiqaq) with and without an installed lexicon source, plus root deck', async () => {
  assert.equal(formatDashedRoot('أ ل ه'), 'أ-ل-ه');
  assert.equal(formatDashedRoot('رحم'), 'ر-ح-م');

  // Case A: with an installed Arabic lexicon defining the root
  const withLex = createFixture({ withArabicLexicon: true });
  try {
    const card = await withLex.service.makeRootCard(
      validateRootCardInput({
        root: 'أ ل ه',
        language: 'ar',
      })
    );
    assert.equal(card.created, true);
    assert.equal(card.dashedRoot, 'أ-ل-ه');
    assert.equal(card.hasLexiconSource, true);
    assert.equal(card.wordCount, 3);

    const row = withLex.db
      .prepare(`SELECT fields_json FROM card_note WHERE id = ?`)
      .get(card.noteId) as { fields_json: string };
    const fields = JSON.parse(row.fields_json) as { Front: string; Back: string };
    assert.ok(fields.Front.includes('أ-ل-ه'), 'front shows root with dashes');
    assert.ok(fields.Back.includes('المألوه المعبود بحق'), 'back includes installed lexicon meaning');
    assert.ok(fields.Back.includes('Al-Mu’jam Al-Wasit'), 'back names the lexicon source');
    assert.ok(fields.Back.includes('ٱللَّهِ') && fields.Back.includes('(2395)'), 'back lists derived Quran words with counts');
  } finally {
    withLex.db.close();
  }

  // Case B: without an installed lexicon source for the root
  const withoutLex = createFixture({ withArabicLexicon: false });
  try {
    const card = await withoutLex.service.makeRootCard(
      validateRootCardInput({
        root: 'ر ح م',
        language: 'en',
      })
    );
    assert.equal(card.created, true);
    assert.equal(card.dashedRoot, 'ر-ح-م');
    assert.equal(card.hasLexiconSource, false);

    const row = withoutLex.db
      .prepare(`SELECT fields_json FROM card_note WHERE id = ?`)
      .get(card.noteId) as { fields_json: string };
    const fields = JSON.parse(row.fields_json) as { Front: string; Back: string };
    assert.ok(fields.Front.includes('ر-ح-م'));
    assert.ok(
      fields.Back.includes('No lexicon source text is installed for this root'),
      'explicitly states no lexicon source is installed rather than inventing meanings'
    );
    assert.ok(fields.Back.includes('ٱلرَّحْمَٰنِ') && fields.Back.includes('(57)'));

    // Root deck for Surah 1 (2 roots in fixture)
    const deck = await withoutLex.service.makeRootDeck(
      validateRootDeckInput({
        deckName: 'Surah Al-Fatihah Roots',
        surah: 1,
        limit: 10,
        language: 'en',
      })
    );
    assert.equal(deck.roots, 2);
    assert.equal(deck.added, 1, 'أ-ل-ه is newly added');
    assert.equal(deck.linked + deck.updated, 1, 'ر-ح-م reuses the existing root note');
  } finally {
    withoutLex.db.close();
  }
});

test('Stage 5: tafsir cards from library tafsir highlights and Quran commentary notes keep schedule on regenerate', async () => {
  const f = createFixture();
  try {
    f.db
      .prepare(`INSERT INTO category (id, name_ar, name_en) VALUES ('islamic-tafsir', 'التفسير', 'Tafsir')`)
      .run();
    f.db
      .prepare(
        `INSERT INTO work (id, title, primary_category_id) VALUES ('w-tafsir', 'تفسير الطبري - جامع البيان', 'islamic-tafsir')`
      )
      .run();
    f.db
      .prepare(
        `INSERT INTO annotations (id, book_id, type, location_cfi_or_page, selected_text, note_content, created_at, updated_at)
         VALUES ('ann-1', 'w-tafsir', 'highlight', '15', 'قوله تعالى في الآية 2:255 الله لا إله إلا هو الحي القيوم أي القائم بتدبير الخلق', 'قاعدة في توحيد الربوبية والألوهية', '2026-11-18', '2026-11-18')`
      )
      .run();

    // Also add a personal commentary note on Quran 112:1
    f.db
      .prepare(
        `INSERT INTO knowledge (id, work_id, knowledge_type, location, created_at, updated_at)
         VALUES ('k-comm-1', NULL, 'note', 'commentary:quran:hafs:112:1:reflection', '2026-11-18', '2026-11-18')`
      )
      .run();
    f.db
      .prepare(`INSERT INTO note_detail (knowledge_id, content) VALUES ('k-comm-1', 'الأحد المنفرد بالكمال المطلق')`)
      .run();

    const works = f.service.listTafsirWorks();
    assert.equal(works.length, 1);
    assert.equal(works[0].isTafsirCategory, true);

    const res = await f.service.makeTafsirDeck(
      validateTafsirDeckInput({
        deckName: 'مراجعة التفسير',
        workId: null,
        includeQuranAnnotations: true,
        language: 'ar',
      })
    );
    assert.equal(res.total, 2);
    assert.equal(res.added, 2);

    const bookCard = f.db
      .prepare(`SELECT fields_json FROM card_note WHERE source_ref = 'tafsir-highlight:w-tafsir/ann-1'`)
      .get() as { fields_json: string };
    const bookFields = JSON.parse(bookCard.fields_json) as { Front: string; Back: string };
    assert.ok(bookFields.Front.includes('البقرة 2:255'), 'front has ayah reference');
    assert.ok(bookFields.Front.includes('قوله تعالى في الآية'), 'front has first words of highlight');
    assert.ok(bookFields.Back.includes('القائم بتدبير الخلق'), 'back has full highlighted tafsir text');
    assert.ok(bookFields.Back.includes('قاعدة في توحيد الربوبية والألوهية'), 'back has user comment');
    assert.ok(bookFields.Back.includes('تفسير الطبري - جامع البيان'), 'back has tafsir name as source');

    // Study the card and regenerate after editing the comment: schedule is preserved
    const qCard = f.srs.queue(res.deckId).cards[0];
    f.srs.grade({ id: qCard.id, revision: qCard.revision, rating: 4, durationMs: 350, deckId: res.deckId });
    const srsBefore = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(qCard.id);

    f.db
      .prepare(`UPDATE annotations SET note_content = 'قاعدة محررة في التوحيد' WHERE id = 'ann-1'`)
      .run();
    const regen = await f.service.makeTafsirDeck(
      validateTafsirDeckInput({
        deckName: 'مراجعة التفسير',
        workId: null,
        includeQuranAnnotations: true,
        language: 'ar',
      })
    );
    assert.equal(regen.updated, 1);
    assert.equal(regen.linked, 1);
    const srsAfter = f.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(qCard.id);
    assert.deepEqual(srsAfter, srsBefore, 'regenerating tafsir deck preserves FSRS schedule');
  } finally {
    f.db.close();
  }
});

test('Strict guardrail (no hifz): quick-add and root cards never contain a full ayah as the answer or prompt', async () => {
  const fullAyah = 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ';
  assert.equal(isSafeNonHifzVocabularyWord(fullAyah), false, 'full ayah is rejected as vocabulary word');
  assert.equal(isSafeNonHifzVocabularyWord('ٱلْقَيُّومُ'), true, 'single Quranic word is allowed');

  assert.throws(
    () =>
      validateQuickAddLookupInput({
        word: fullAyah,
        meaning: 'Allah - there is no deity except Him, the Ever-Living',
        source: '2:255',
        kind: 'quran-word',
        language: 'ar',
      }),
    /hifz-guardrail/u,
    'quickAdd refuses a full ayah in quran-word mode'
  );

  // Even if a root reader returned a multi-word verse fragment, buildRootCardFields filters it out so no full ayah appears on the answer side
  const f = createFixture({ withArabicLexicon: true });
  try {
    const customService = new LexiconDeckService(f.db, {
      listDictionaries: () => [],
      readEntry: async () => null,
      lookupDictionary: async () => [],
      quranFrequency: async () => ({ family: 'root', total: 1, distinct: 1, rows: [{ text: 'ق و م', count: 1 }] }),
      quranRootWords: async () => ({
        root: 'ق و م',
        total: 10,
        words: [
          { word: 'ٱلْقَيُّومُ', count: 3, meaning: 'the Sustainer' },
          { word: fullAyah, count: 1, meaning: 'should be filtered out by no-hifz guardrail' },
        ],
      }),
    });

    const built = await customService.buildRootCardFields('ق و م', 'ar');
    assert.ok(built.fields.Back.includes('ٱلْقَيُّومُ'), 'single vocabulary word is kept');
    assert.ok(!built.fields.Back.includes(fullAyah), 'full ayah never appears in the root card answer');
    assert.ok(!built.fields.Front.includes(fullAyah), 'full ayah never appears in the root card front');
  } finally {
    f.db.close();
  }
});
