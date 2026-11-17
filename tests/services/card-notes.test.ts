import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations } from '../../src/main/database/migrations';
import { runMigrations } from '../../src/main/database/migrator';
import { CardNoteRepository } from '../../src/main/database/repositories/card-note.repository';
import { KnowledgeCardRepository } from '../../src/main/database/repositories/knowledge-card.repository';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import {
  renderTemplate,
  generateCards,
  computeTypeDiff,
  processClozes,
  extractClozeNumbers,
} from '../../src/shared/revision/template-engine';
import type { CardNoteType } from '../../src/shared/types/card-notes';
import {
  validateSafeId,
  validateSaveNoteInput,
  validateSaveNoteTypeInput,
} from '../../src/shared/types/card-notes';
import { translations } from '../../src/renderer/translations';

function setup() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  runMigrations(db, migrations);
  return {
    db,
    notes: new CardNoteRepository(db),
    cards: new KnowledgeCardRepository(db),
    settings: new SqliteSettingsRepository(db),
  };
}

test('migration 030 backfills existing cards into Basic notes, seeds note types, and down migration cleanly reverses', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys=ON');
  try {
    // Run up to 029
    runMigrations(db, migrations.filter(m => m.id < 30));

    // Create existing cards and decks
    db.prepare(`INSERT INTO work (id, title) VALUES ('w1', 'Book 1')`).run();
    db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at) VALUES ('c1', 'w1', 'card', '2026-01-01', '2026-01-01')`).run();
    db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, question_kind) VALUES ('c1', 'F1', 'B1', 'note', 'ref1', 'recall')`).run();

    db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at) VALUES ('c2', 'w1', 'card', '2026-01-02', '2026-01-02')`).run();
    db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, question_kind) VALUES ('c2', 'Q Choice', 'A Choice', 'book', 'ref2', 'choice')`).run();

    db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at) VALUES ('c3', 'w1', 'card', '2026-01-03', '2026-01-03')`).run();
    db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, question_kind) VALUES ('c3', 'البقرة 2:255', 'آية الكرسي', 'quran', 'quran:hafs:2:255', 'recall')`).run();

    db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at) VALUES ('c4', 'w1', 'card', '2026-01-04', '2026-01-04')`).run();
    db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, question_kind) VALUES ('c4', 'بدء الوحي', 'إنما الأعمال بالنيات', 'hadith', 'sunnah:Bukhari:1:1', 'recall')`).run();

    db.prepare(`INSERT INTO knowledge (id, work_id, knowledge_type, created_at, updated_at) VALUES ('c5', 'w1', 'card', '2026-01-05', '2026-01-05')`).run();
    db.prepare(`INSERT INTO card_detail (knowledge_id, front, back, source_kind, source_ref, question_kind) VALUES ('c5', 'امرؤ القيس', 'قفا نبك', 'poetry', 'poetry:imru:1', 'recall')`).run();

    // Now run migration 030
    runMigrations(db, migrations);

    // Verify card_note table populated
    interface DbNote {
      id: string;
      note_type_id: string;
      fields_json: string;
      source_snapshot_json: string | null;
    }

    const note1 = db.prepare(`SELECT * FROM card_note WHERE guid = 'c1'`).get() as DbNote | undefined;
    assert.ok(note1);
    assert.equal(note1.note_type_id, 'stock-basic');
    assert.deepEqual(JSON.parse(note1.fields_json), { Front: 'F1', Back: 'B1' });

    const note2 = db.prepare(`SELECT * FROM card_note WHERE guid = 'c2'`).get() as DbNote | undefined;
    assert.ok(note2);
    assert.equal(note2.note_type_id, 'stock-multiple-choice');

    // Quran card backfilled to stock-quran with Ayah in source_text field
    const note3 = db.prepare(`SELECT * FROM card_note WHERE guid = 'c3'`).get() as DbNote | undefined;
    assert.ok(note3);
    assert.equal(note3.note_type_id, 'stock-quran');
    const f3 = JSON.parse(note3.fields_json);
    assert.equal(f3.Ayah, 'آية الكرسي');
    assert.equal(f3.Surah, 'البقرة 2:255');
    assert.ok(note3.source_snapshot_json);

    // Hadith card backfilled to stock-hadith with Hadith in source_text field
    const note4 = db.prepare(`SELECT * FROM card_note WHERE guid = 'c4'`).get() as DbNote | undefined;
    assert.ok(note4);
    assert.equal(note4.note_type_id, 'stock-hadith');
    const f4 = JSON.parse(note4.fields_json);
    assert.equal(f4.Hadith, 'إنما الأعمال بالنيات');
    assert.equal(f4.Bab, 'بدء الوحي');
    assert.ok(note4.source_snapshot_json);

    // Poetry card backfilled to stock-poetry with Poem in source_text field
    const note5 = db.prepare(`SELECT * FROM card_note WHERE guid = 'c5'`).get() as DbNote | undefined;
    assert.ok(note5);
    assert.equal(note5.note_type_id, 'stock-poetry');
    const f5 = JSON.parse(note5.fields_json);
    assert.equal(f5.Poem, 'قفا نبك');
    assert.equal(f5.Poet, 'امرؤ القيس');
    assert.ok(note5.source_snapshot_json);

    // Verify card_detail updated
    interface DbCardDetail {
      note_id: string;
      ord: number;
    }
    const cd1 = db.prepare(`SELECT * FROM card_detail WHERE knowledge_id = 'c1'`).get() as DbCardDetail | undefined;
    assert.ok(cd1);
    assert.equal(cd1.note_id, note1.id);
    assert.equal(cd1.ord, 0);

    // Verify stock note types exist
    const types = db.prepare(`SELECT id FROM card_note_type`).all() as Array<{ id: string }>;
    assert.ok(types.length >= 7);

    // Test down migration
    migrations.find(m => m.id === 30)!.down!(db);
    assert.equal(db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_note'`).get(), undefined);
    assert.equal(db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_note_type'`).get(), undefined);

    const cols = db.prepare(`PRAGMA table_info(card_detail)`).all() as Array<{ name: string }>;
    assert.ok(!cols.some(c => c.name === 'note_id'));
  } finally {
    db.close();
  }
});

test('template engine: handles basic fields, FrontSide, conditionals and inverted conditionals', () => {
  const fields = { Front: 'Capital of France', Back: 'Paris', Extra: '' };

  const front = renderTemplate('{{Front}}', { fields }, 'front');
  assert.equal(front, 'Capital of France');

  const backTpl = '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}\n{{#Extra}}Extra: {{Extra}}{{/Extra}}{{^Extra}}No extra{{/Extra}}';
  const back = renderTemplate(backTpl, { fields, frontRendered: front }, 'back');
  assert.ok(back.includes('Capital of France'));
  assert.ok(back.includes('Paris'));
  assert.ok(back.includes('No extra'));
  assert.ok(!back.includes('Extra: '));
});

test('template engine: modifiers text: and hint:', () => {
  const fields = { Front: '<b>Bold</b> and <i>italic</i>', Hint: 'Secret clue' };

  const stripped = renderTemplate('{{text:Front}}', { fields }, 'front');
  assert.equal(stripped, 'Bold and italic');

  const withHint = renderTemplate('{{hint:Hint}}', { fields }, 'front');
  assert.ok(withHint.includes('<details class="hint">'));
  assert.ok(withHint.includes('Secret clue'));
});

test('template engine: cloze syntax with hints, multi-card c1,2 and nesting', () => {
  const text = '{{c1::Abu Bakr::First Caliph}} and {{c2::Umar}} and {{c1,2::both Companions}}';

  const c1Front = processClozes(text, 1, 'front').rendered;
  assert.ok(c1Front.includes('<span class="cloze">[First Caliph]</span>'));
  assert.ok(c1Front.includes('Umar')); // not occluded on c1
  assert.ok(c1Front.includes('<span class="cloze">[...]</span>')); // c1,2 is occluded on c1

  const c1Back = processClozes(text, 1, 'back').rendered;
  assert.ok(c1Back.includes('<span class="cloze">Abu Bakr</span>'));
  assert.ok(c1Back.includes('<span class="cloze">both Companions</span>'));

  // Cloze numbers extraction
  assert.deepEqual(extractClozeNumbers(text), [1, 2]);

  // Nested cloze: {{c1::foo {{c2::bar}}}}
  const nested = '{{c1::Outer {{c2::Inner}} text}}';
  const n1Front = processClozes(nested, 1, 'front').rendered;
  assert.ok(n1Front.includes('<span class="cloze">[...]</span>'));
});

test('template engine: type-in answer and character diff with type:nc ignoring combining marks', () => {
  const expected = 'قَالَ رَسُولُ اللَّهِ';
  const typedWithTashkeel = 'قَالَ رَسُولُ اللَّهِ';
  const typedWithoutTashkeel = 'قال رسول الله';

  // Exact comparison
  const diffMatching = computeTypeDiff(typedWithTashkeel, expected, false);
  assert.equal(diffMatching.isCorrect, true);

  const diffExact = computeTypeDiff(typedWithoutTashkeel, expected, false);
  assert.equal(diffExact.isCorrect, false);

  // type:nc ignoring combining marks
  const diffNc = computeTypeDiff(typedWithoutTashkeel, expected, true);
  assert.equal(diffNc.isCorrect, true);
  assert.ok(diffNc.html.includes('type-diff'));
});

test('card generation: only generates cards when front is non-empty and handles optional reverse', () => {
  const stockOptionalReverse: CardNoteType = {
    id: 'test-optional',
    name: 'Basic (optional reversed card)',
    kind: 'normal',
    stockKind: 'basic_optional_reversed',
    css: '',
    sortFieldOrd: 0,
    ankiId: null,
    ankiExtra: null,
    fields: [
      { noteTypeId: 'test-optional', ord: 0, name: 'Front', rtl: false, font: null, sizePx: null, sourceText: false, ankiId: null },
      { noteTypeId: 'test-optional', ord: 1, name: 'Back', rtl: false, font: null, sizePx: null, sourceText: false, ankiId: null },
      { noteTypeId: 'test-optional', ord: 2, name: 'Add Reverse', rtl: false, font: null, sizePx: null, sourceText: false, ankiId: null },
    ],
    templates: [
      { noteTypeId: 'test-optional', ord: 0, name: 'Card 1', front: '{{Front}}', back: '{{FrontSide}}\n\n{{Back}}', ankiId: null },
      { noteTypeId: 'test-optional', ord: 1, name: 'Card 2', front: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}', back: '{{FrontSide}}\n\n{{Front}}', ankiId: null },
    ],
    createdAt: '',
    updatedAt: '',
  };

  // When Add Reverse is empty, only 1 card generated
  const gen1 = generateCards(stockOptionalReverse, { Front: 'F', Back: 'B', 'Add Reverse': '' });
  assert.equal(gen1.length, 1);
  assert.equal(gen1[0].ord, 0);

  // When Add Reverse is non-empty (e.g. 'y'), 2 cards generated
  const gen2 = generateCards(stockOptionalReverse, { Front: 'F', Back: 'B', 'Add Reverse': 'y' });
  assert.equal(gen2.length, 2);
  assert.equal(gen2[0].ord, 0);
  assert.equal(gen2[1].ord, 1);
});

test('card generation: progressive context cloze uses poetryBayts for multi-line poetry', () => {
  const contextClozeType: CardNoteType = {
    id: 'test-context',
    name: 'Progressive context cloze',
    kind: 'context_cloze',
    stockKind: 'progressive_context_cloze',
    css: '',
    sortFieldOrd: 0,
    ankiId: null,
    ankiExtra: null,
    fields: [
      { noteTypeId: 'test-context', ord: 0, name: 'Target', rtl: true, font: null, sizePx: null, sourceText: true, ankiId: null },
    ],
    templates: [
      {
        noteTypeId: 'test-context',
        ord: 0,
        name: 'Context Card',
        front: '<div class="context-before">{{Context Before}}</div>\n<div class="cloze-target">{{cloze:Target}}</div>\n<div class="context-after context-blurred">{{Context After}}</div>',
        back: '{{FrontSide}}\n\n{{Notes}}',
        ankiId: null,
      },
    ],
    createdAt: '',
    updatedAt: '',
  };

  // 4 verses = 2 bayts
  const poetryText = `قِفا نَبكِ مِن ذِكرى حَبيبٍ وَمَنزِلِ
بِسِقطِ اللِوى بَينَ الدَخولِ فَحَومَلِ
فَتوضِحَ فَالمِقراةِ لَم يَعفُ رَسمُها
لِما نَسَجَتها مِن جَنوبٍ وَشَمأَلِ`;

  const cards = generateCards(contextClozeType, { Target: poetryText });
  assert.equal(cards.length, 2);
  assert.equal(cards[0].ord, 0);
  assert.equal(cards[1].ord, 1);
  // Card 1: target has ajuz clozed
  assert.ok(cards[0].front.includes('<span class="cloze">[...]</span>'));
  // Card 2: context before has bayt 1
  assert.ok(cards[1].front.includes('قِفا نَبكِ'));
});

test('editing a note only ever adds cards (empty cards listed, never deleted automatically)', () => {
  const { notes } = setup();

  // Create note with Cloze c1 and c2 -> 2 cards
  const { note, cards } = notes.saveNote({
    noteTypeId: 'stock-cloze',
    fields: { Text: '{{c1::One}} and {{c2::Two}}', 'Back Extra': '' },
  });
  assert.equal(cards.length, 2);

  // Edit note to remove c2 -> now only c1 renders
  const result = notes.saveNote({
    id: note.id,
    noteTypeId: 'stock-cloze',
    fields: { Text: '{{c1::One}} only', 'Back Extra': '' },
  });

  // Empty cards list reports ord 1
  assert.equal(result.emptyCards.length, 1);
  assert.equal(result.emptyCards[0].ord, 1);

  // But the existing card is NOT deleted from database
  const liveCards = notes.getCardsForNote(note.id);
  assert.equal(liveCards.length, 2);
});

test('source text protection: setting revision.protectSourceText prevents edits to source_text fields and update refuses them', () => {
  const { notes, cards, settings } = setup();

  // Save a Quran card with source_text fields
  const savedCard = cards.save({
    front: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ',
    back: 'Ayat al-Kursi',
    sourceKind: 'quran',
    sourceRef: 'quran:2:255',
  });

  // Default: protection is OFF. Editing is permitted!
  const updated = cards.update(savedCard.id, {
    front: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ',
    back: 'Ayat al-Kursi updated',
    sourceKind: 'quran',
    sourceRef: 'quran:2:255',
  }, savedCard.cardRevision ?? 0);
  assert.ok(updated.front.includes('ٱلْحَىُّ ٱلْقَيُّومُ'));

  // Turn protection ON
  settings.set('revision.protectSourceText', true);

  // Now editing is refused with invalid-request
  assert.throws(
    () =>
      cards.update(savedCard.id, {
        front: 'Modified text',
        back: 'Ayat al-Kursi updated',
        sourceKind: 'quran',
        sourceRef: 'quran:2:255',
      }, updated.cardRevision ?? 1),
    /invalid-request/
  );

  // CardNoteRepository also refuses edit when protection is ON
  const { note } = notes.saveNote({
    noteTypeId: 'stock-quran',
    fields: { Ayah: 'الأصل', Surah: 'البقرة' },
  });

  assert.throws(
    () =>
      notes.saveNote({
        id: note.id,
        noteTypeId: 'stock-quran',
        fields: { Ayah: 'تعديل', Surah: 'البقرة' },
      }),
    /source-text-protected/
  );

  // Turn protection back OFF
  settings.set('revision.protectSourceText', false);
});

test('source text restore: restoreSourceText restores original fields from source_snapshot_json', () => {
  const { notes } = setup();

  const originalAyah = 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ';
  const { note } = notes.saveNote({
    noteTypeId: 'stock-quran',
    fields: { Ayah: originalAyah, Surah: 'البقرة ٢٥٥' },
  });

  // Edit with user additions
  const edited = notes.saveNote({
    id: note.id,
    noteTypeId: 'stock-quran',
    fields: { Ayah: `${originalAyah} [تفسير]`, Surah: 'البقرة ٢٥٥' },
  });
  assert.ok(edited.note.fields['Ayah'].includes('[تفسير]'));

  // Restore original
  const restored = notes.restoreSourceText(note.id);
  assert.equal(restored.fields['Ayah'], originalAyah);
});

test('shared cards: forkNoteForDeck copies note and cards, sets copied_from_note_id, preserves srs_state, and moves deck link', () => {
  const { notes } = setup();

  // Save note linked to deck-a and link to deck-b as well
  const { note, cards: [card1] } = notes.saveNote({
    noteTypeId: 'stock-basic',
    fields: { Front: 'Shared Front', Back: 'Shared Back' },
    deckId: 'deck-a',
  });

  notes.linkNoteToDeck(note.id, 'deck-b');

  // Verify it is in both decks
  const decksBefore = notes.getDecksForNote(note.id);
  assert.deepEqual(decksBefore.sort(), ['deck-a', 'deck-b']);

  // Fork for deck-b ("Change in this deck only")
  const { newNote, newCards } = notes.forkNoteForDeck(note.id, 'deck-b');

  assert.equal(newNote.copiedFromNoteId, note.id);
  assert.equal(newCards.length, 1);
  assert.notEqual(newCards[0].id, card1.id);
  assert.equal(newCards[0].memorizing, true);

  // Original note is now only in deck-a
  assert.deepEqual(notes.getDecksForNote(note.id), ['deck-a']);

  // Forked note is now in deck-b
  assert.deepEqual(notes.getDecksForNote(newNote.id), ['deck-b']);
});

test('IPC input validation rejects malformed note and note-type inputs', () => {
  // Safe ID validation
  assert.equal(validateSafeId('valid-id_123:abc'), 'valid-id_123:abc');
  assert.throws(() => validateSafeId(''), /invalid id/);
  assert.throws(() => validateSafeId('bad space'), /invalid id format/);
  assert.throws(() => validateSafeId('a'.repeat(150)), /invalid id/);

  // Note input validation
  assert.throws(() => validateSaveNoteInput(null), /must be an object/);
  assert.throws(() => validateSaveNoteInput({ noteTypeId: 'stock-basic', unknownKey: 'foo' }), /unknown key/);
  assert.throws(() => validateSaveNoteInput({ noteTypeId: 'stock-basic', fields: {} }), /fields count must be between 1 and 64/);
  assert.throws(
    () => validateSaveNoteInput({ noteTypeId: 'stock-basic', fields: { Front: 'a'.repeat(25000) } }),
    /exceeds maximum length 20,000/
  );

  // Note-type input validation
  assert.throws(() => validateSaveNoteTypeInput(null), /must be an object/);
  assert.throws(() => validateSaveNoteTypeInput({ name: '' }), /name must be 1 to 200 chars/);
  assert.throws(() => validateSaveNoteTypeInput({ name: 'Type', kind: 'invalid-kind' }), /invalid kind/);
  assert.throws(() => validateSaveNoteTypeInput({ name: 'Type', fields: [] }), /fields must be an array of 1 to 64 items/);
  assert.throws(
    () =>
      validateSaveNoteTypeInput({
        name: 'Type',
        fields: [{ name: 'F1' }],
        templates: [{ name: 'T1', front: 'a'.repeat(60000), back: 'b' }],
      }),
    /invalid front/
  );
});

test('card note translation keys are defined and localized in ar and en', () => {
  const keys = [
    'noteEditorTitle',
    'protectSourceTextSetting',
    'newNoteType',
    'addField',
    'addTemplate',
    'templateName',
    'cssStyling',
  ] as const;

  for (const k of keys) {
    assert.ok((translations.ar as Record<string, string>)[k], 'Arabic translation must exist for ' + k);
    assert.ok((translations.en as Record<string, string>)[k], 'English translation must exist for ' + k);
  }
});
