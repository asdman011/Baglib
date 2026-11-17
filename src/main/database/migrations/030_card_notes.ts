import { randomUUID } from 'node:crypto';
import type { Migration } from '../migrator';

export const STOCK_NOTE_TYPES = [
  {
    id: 'stock-basic',
    name: 'Basic',
    kind: 'normal',
    stock_kind: 'basic',
    css: '.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 20px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 1.6; }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Front', rtl: 0, source_text: 0 },
      { ord: 1, name: 'Back', rtl: 0, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Card 1',
        front: '{{Front}}',
        back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
      },
    ],
  },
  {
    id: 'stock-basic-reversed',
    name: 'Basic (and reversed card)',
    kind: 'normal',
    stock_kind: 'basic_reversed',
    css: '.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 20px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 1.6; }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Front', rtl: 0, source_text: 0 },
      { ord: 1, name: 'Back', rtl: 0, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Card 1',
        front: '{{Front}}',
        back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
      },
      {
        ord: 1,
        name: 'Card 2',
        front: '{{Back}}',
        back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
      },
    ],
  },
  {
    id: 'stock-basic-optional-reversed',
    name: 'Basic (optional reversed card)',
    kind: 'normal',
    stock_kind: 'basic_optional_reversed',
    css: '.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 20px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 1.6; }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Front', rtl: 0, source_text: 0 },
      { ord: 1, name: 'Back', rtl: 0, source_text: 0 },
      { ord: 2, name: 'Add Reverse', rtl: 0, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Card 1',
        front: '{{Front}}',
        back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
      },
      {
        ord: 1,
        name: 'Card 2',
        front: '{{#Add Reverse}}{{Back}}{{/Add Reverse}}',
        back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}',
      },
    ],
  },
  {
    id: 'stock-cloze',
    name: 'Cloze',
    kind: 'cloze',
    stock_kind: 'cloze',
    css: '.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 20px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 1.6; }\n.cloze { font-weight: bold; color: var(--cloze, blue); }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Text', rtl: 0, source_text: 0 },
      { ord: 1, name: 'Back Extra', rtl: 0, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Cloze',
        front: '{{cloze:Text}}',
        back: '{{cloze:Text}}\n\n<hr id=answer>\n\n{{Back Extra}}',
      },
    ],
  },
  {
    id: 'stock-context-cloze',
    name: 'Progressive context cloze',
    kind: 'context_cloze',
    stock_kind: 'progressive_context_cloze',
    css: '.card { font-family: "Traditional Arabic", "Scheherazade New", Amiri, serif; font-size: 24px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 2.0; }\n.context-blurred { filter: blur(4px); opacity: 0.6; user-select: none; }\n.cloze { font-weight: bold; color: var(--cloze, #1d4ed8); }',
    sort_field_ord: 1,
    fields: [
      { ord: 0, name: 'Context Before', rtl: 1, source_text: 0 },
      { ord: 1, name: 'Target', rtl: 1, source_text: 1 },
      { ord: 2, name: 'Context After', rtl: 1, source_text: 0 },
      { ord: 3, name: 'Notes', rtl: 1, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Context Card',
        front: '<div class="context-before">{{Context Before}}</div>\n<div class="cloze-target">{{cloze:Target}}</div>\n<div class="context-after context-blurred">{{Context After}}</div>',
        back: '{{FrontSide}}\n\n<hr id=answer>\n\n<div class="notes">{{Notes}}</div>',
      },
    ],
  },
  {
    id: 'stock-basic-typing',
    name: 'Basic (type in the answer)',
    kind: 'normal',
    stock_kind: 'basic_typing',
    css: '.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 20px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 1.6; }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Front', rtl: 0, source_text: 0 },
      { ord: 1, name: 'Back', rtl: 0, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Card 1',
        front: '{{Front}}\n\n{{type:Back}}',
        back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
      },
    ],
  },
  {
    id: 'stock-multiple-choice',
    name: 'Multiple choice',
    kind: 'choice',
    stock_kind: 'multiple_choice',
    css: '.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; font-size: 20px; text-align: start; color: var(--fg, black); background-color: transparent; line-height: 1.6; }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Front', rtl: 0, source_text: 0 },
      { ord: 1, name: 'Back', rtl: 0, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Card 1',
        front: '{{Front}}',
        back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
      },
    ],
  },
  {
    id: 'stock-quran',
    name: 'Quran',
    kind: 'normal',
    stock_kind: 'quran',
    css: '.card { font-family: "Traditional Arabic", "Scheherazade New", Amiri, serif; font-size: 24px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 2.2; }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Ayah', rtl: 1, source_text: 1 },
      { ord: 1, name: 'Surah', rtl: 1, source_text: 0 },
      { ord: 2, name: 'Translation', rtl: 0, source_text: 0 },
      { ord: 3, name: 'Notes', rtl: 1, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Card 1',
        front: '<div class="surah">{{Surah}}</div>\n<div class="ayah">{{Ayah}}</div>',
        back: '{{FrontSide}}\n\n<hr id=answer>\n<div class="translation">{{Translation}}</div>\n<div class="notes">{{Notes}}</div>',
      },
    ],
  },
  {
    id: 'stock-hadith',
    name: 'Hadith',
    kind: 'normal',
    stock_kind: 'hadith',
    css: '.card { font-family: "Traditional Arabic", "Scheherazade New", Amiri, serif; font-size: 22px; text-align: start; color: var(--fg, black); background-color: transparent; line-height: 2.0; }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Bab', rtl: 1, source_text: 0 },
      { ord: 1, name: 'Hadith', rtl: 1, source_text: 1 },
      { ord: 2, name: 'Sharh', rtl: 1, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Card 1',
        front: '<div class="bab">{{Bab}}</div>',
        back: '{{FrontSide}}\n\n<hr id=answer>\n<div class="hadith">{{Hadith}}</div>\n<div class="sharh">{{Sharh}}</div>',
      },
    ],
  },
  {
    id: 'stock-poetry',
    name: 'Poetry',
    kind: 'normal',
    stock_kind: 'poetry',
    css: '.card { font-family: "Traditional Arabic", "Scheherazade New", Amiri, serif; font-size: 22px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 2.0; }',
    sort_field_ord: 0,
    fields: [
      { ord: 0, name: 'Poet', rtl: 1, source_text: 0 },
      { ord: 1, name: 'Poem', rtl: 1, source_text: 1 },
      { ord: 2, name: 'Sharh', rtl: 1, source_text: 0 },
    ],
    templates: [
      {
        ord: 0,
        name: 'Card 1',
        front: '<div class="poet">{{Poet}}</div>\n<div class="poem">{{Poem}}</div>',
        back: '{{FrontSide}}\n\n<hr id=answer>\n<div class="sharh">{{Sharh}}</div>',
      },
    ],
  },
];

const migration: Migration = {
  id: 30,
  name: 'card_notes',
  up(db) {
    db.exec(`
      CREATE TABLE card_note_type (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('normal', 'cloze', 'image_occlusion', 'context_cloze', 'choice')),
        stock_kind TEXT NULL,
        css TEXT NOT NULL DEFAULT '',
        sort_field_ord INTEGER NOT NULL DEFAULT 0,
        anki_id INTEGER NULL,
        anki_extra TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE card_note_field (
        note_type_id TEXT NOT NULL REFERENCES card_note_type(id) ON DELETE CASCADE,
        ord INTEGER NOT NULL,
        name TEXT NOT NULL,
        rtl INTEGER NOT NULL DEFAULT 0,
        font TEXT NULL,
        size_px INTEGER NULL,
        source_text INTEGER NOT NULL DEFAULT 0,
        anki_id INTEGER NULL,
        PRIMARY KEY (note_type_id, ord),
        UNIQUE (note_type_id, name)
      );

      CREATE TABLE card_note_template (
        note_type_id TEXT NOT NULL REFERENCES card_note_type(id) ON DELETE CASCADE,
        ord INTEGER NOT NULL,
        name TEXT NOT NULL,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        anki_id INTEGER NULL,
        PRIMARY KEY (note_type_id, ord),
        UNIQUE (note_type_id, name)
      );

      CREATE TABLE card_note (
        id TEXT PRIMARY KEY,
        note_type_id TEXT NOT NULL REFERENCES card_note_type(id) ON DELETE RESTRICT,
        fields_json TEXT NOT NULL,
        guid TEXT NOT NULL UNIQUE,
        copied_from_note_id TEXT NULL REFERENCES card_note(id) ON DELETE SET NULL,
        source_ref TEXT NULL,
        source_snapshot_json TEXT NULL,
        source_hash TEXT NULL,
        source_changed_at TEXT NULL,
        orphaned_at TEXT NULL,
        anki_id INTEGER NULL,
        anki_extra TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_card_note_type ON card_note(note_type_id);
      CREATE INDEX idx_card_note_source_ref ON card_note(source_ref) WHERE source_ref IS NOT NULL;
      CREATE INDEX idx_card_note_copied_from ON card_note(copied_from_note_id) WHERE copied_from_note_id IS NOT NULL;
      CREATE INDEX idx_card_note_source_changed ON card_note(source_changed_at) WHERE source_changed_at IS NOT NULL;
      CREATE INDEX idx_card_note_orphaned ON card_note(orphaned_at) WHERE orphaned_at IS NOT NULL;

      ALTER TABLE card_detail ADD COLUMN note_id TEXT REFERENCES card_note(id) ON DELETE SET NULL;
      ALTER TABLE card_detail ADD COLUMN ord INTEGER;
      ALTER TABLE card_detail ADD COLUMN anki_id INTEGER;
      ALTER TABLE card_detail ADD COLUMN anki_extra TEXT;

      CREATE UNIQUE INDEX idx_card_detail_note_ord ON card_detail(note_id, ord) WHERE note_id IS NOT NULL;
    `);

    const now = new Date().toISOString();
    const insertType = db.prepare(`
      INSERT INTO card_note_type (id, name, kind, stock_kind, css, sort_field_ord, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertField = db.prepare(`
      INSERT INTO card_note_field (note_type_id, ord, name, rtl, source_text)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertTemplate = db.prepare(`
      INSERT INTO card_note_template (note_type_id, ord, name, front, back)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const nt of STOCK_NOTE_TYPES) {
      insertType.run(nt.id, nt.name, nt.kind, nt.stock_kind, nt.css, nt.sort_field_ord, now, now);
      for (const f of nt.fields) {
        insertField.run(nt.id, f.ord, f.name, f.rtl, f.source_text);
      }
      for (const t of nt.templates) {
        insertTemplate.run(nt.id, t.ord, t.name, t.front, t.back);
      }
    }

    // Backfill existing cards
    const existingCards = db.prepare(`
      SELECT c.knowledge_id, c.front, c.back, c.question_kind, c.source_kind, c.source_ref, k.created_at, k.updated_at
      FROM card_detail c
      JOIN knowledge k ON k.id = c.knowledge_id
      WHERE c.note_id IS NULL
    `).all() as Array<{
      knowledge_id: string;
      front: string;
      back: string;
      question_kind: string;
      source_kind: string;
      source_ref: string | null;
      created_at: string;
      updated_at: string;
    }>;

    const insertNote = db.prepare(`
      INSERT INTO card_note (id, note_type_id, fields_json, guid, source_ref, source_snapshot_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateCard = db.prepare(`
      UPDATE card_detail SET note_id = ?, ord = 0 WHERE knowledge_id = ?
    `);

    for (const card of existingCards) {
      const noteId = randomUUID();
      let noteTypeId = 'stock-basic';
      let fields: Record<string, string> = { Front: card.front, Back: card.back };
      let snapshotJson: string | null = null;

      if (card.source_kind === 'quran') {
        noteTypeId = 'stock-quran';
        fields = {
          Ayah: card.back,
          Surah: card.front,
          Translation: '',
          Notes: '',
        };
        snapshotJson = JSON.stringify(fields);
      } else if (card.source_kind === 'hadith') {
        noteTypeId = 'stock-hadith';
        fields = {
          Bab: card.front,
          Hadith: card.back,
          Sharh: '',
        };
        snapshotJson = JSON.stringify(fields);
      } else if (card.source_kind === 'poetry') {
        noteTypeId = 'stock-poetry';
        fields = {
          Poet: card.front,
          Poem: card.back,
          Sharh: '',
        };
        snapshotJson = JSON.stringify(fields);
      } else if (card.question_kind === 'choice') {
        noteTypeId = 'stock-multiple-choice';
      }

      const fieldsJson = JSON.stringify(fields);

      insertNote.run(
        noteId,
        noteTypeId,
        fieldsJson,
        card.knowledge_id,
        card.source_ref,
        snapshotJson,
        card.created_at || now,
        card.updated_at || now
      );
      updateCard.run(noteId, card.knowledge_id);
    }
  },

  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_card_detail_note_ord;
      ALTER TABLE card_detail DROP COLUMN note_id;
      ALTER TABLE card_detail DROP COLUMN ord;
      ALTER TABLE card_detail DROP COLUMN anki_id;
      ALTER TABLE card_detail DROP COLUMN anki_extra;
      DROP INDEX IF EXISTS idx_card_note_orphaned;
      DROP INDEX IF EXISTS idx_card_note_source_changed;
      DROP INDEX IF EXISTS idx_card_note_copied_from;
      DROP INDEX IF EXISTS idx_card_note_source_ref;
      DROP INDEX IF EXISTS idx_card_note_type;
      DROP TABLE IF EXISTS card_note;
      DROP TABLE IF EXISTS card_note_template;
      DROP TABLE IF EXISTS card_note_field;
      DROP TABLE IF EXISTS card_note_type;
    `);
  },
};

export default migration;
