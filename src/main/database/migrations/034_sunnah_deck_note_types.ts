/**
 * Baglib — Migration 034: built-in note types for Sunnah decks (KEY-396). Data only.
 *
 * "Hadith (variants)": one note per hadith with three card templates, each switched on by a flag
 * field (Anki's optional-card pattern), so variants of one hadith are siblings of one note and
 * sibling burying keeps one card from giving away another:
 *   1. bab → full isnad + matn (the default, like the user's own Anki "حديث" type)
 *   2. bab → matn only
 *   3. isnad → matn
 * Hadith, Isnad and Matn are source-text fields, copied verbatim from the corpus (ADR-006).
 *
 * "Narrator": one card per narrator (rijal al-isnad): the name on the front, and on the back only
 * the details the user chose when making the deck (empty fields are not shown).
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

export const HADITH_VARIANTS_NOTE_TYPE_ID = 'stock-hadith-variants';
export const NARRATOR_NOTE_TYPE_ID = 'stock-narrator';

const ARABIC_CSS = `.card { font-family: "Traditional Arabic", "Scheherazade New", Amiri, serif; font-size: 22px; text-align: start; color: var(--fg, black); background-color: transparent; line-height: 2.1; direction: rtl; }
.bab, .narrator { font-weight: bold; }
.isnad { color: var(--muted, #555); }
.sharh, .narrator-field .label { color: var(--muted, #555); font-size: 0.9em; }
.narrator-field { margin: 4px 0; }`;

const backHadith = '{{FrontSide}}\n\n<hr id=answer>\n<div class="hadith">{{Hadith}}</div>\n{{#Sharh}}<div class="sharh">{{Sharh}}</div>{{/Sharh}}';
const backMatn = '{{FrontSide}}\n\n<hr id=answer>\n<div class="matn">{{Matn}}</div>\n{{#Sharh}}<div class="sharh">{{Sharh}}</div>{{/Sharh}}';

export const HADITH_VARIANTS_FIELDS: Array<{ name: string; sourceText: boolean }> = [
  { name: 'Bab', sourceText: false },
  { name: 'Hadith', sourceText: true },
  { name: 'Isnad', sourceText: true },
  { name: 'Matn', sourceText: true },
  { name: 'Sharh', sourceText: false },
  { name: 'Full card', sourceText: false },
  { name: 'Matn card', sourceText: false },
  { name: 'Isnad card', sourceText: false },
];

const HADITH_TEMPLATES = [
  { name: 'Bab → isnad and matn', front: '{{#Full card}}<div class="bab">{{Bab}}</div>{{/Full card}}', back: backHadith },
  { name: 'Bab → matn', front: '{{#Matn card}}<div class="bab">{{Bab}}</div>{{/Matn card}}', back: backMatn },
  { name: 'Isnad → matn', front: '{{#Isnad card}}<div class="isnad">{{Isnad}}</div>{{/Isnad card}}', back: backMatn },
];

/** Narrator fields with the Arabic label shown on the card (the rijal data is Arabic). */
export const NARRATOR_FIELDS: Array<{ name: string; label: string }> = [
  { name: 'Name', label: 'الاسم' },
  { name: 'Kunya', label: 'الكنية' },
  { name: 'Nasab', label: 'النسب' },
  { name: 'Laqab', label: 'اللقب والنسبة' },
  { name: 'Tabaqah', label: 'الطبقة' },
  { name: 'Death', label: 'الوفاة' },
  { name: 'Grade', label: 'الجرح والتعديل' },
  { name: 'Teachers', label: 'شيوخه' },
  { name: 'Students', label: 'تلاميذه' },
];

const narratorBack = `{{FrontSide}}\n\n<hr id=answer>\n${NARRATOR_FIELDS.slice(1)
  .map(f => `{{#${f.name}}}<div class="narrator-field"><span class="label">${f.label}:</span> {{${f.name}}}</div>{{/${f.name}}}`)
  .join('\n')}`;

const migration: Migration = {
  id: 34,
  name: 'sunnah_deck_note_types',
  up(db: Database) {
    const now = new Date().toISOString();
    const insertType = db.prepare(
      `INSERT OR IGNORE INTO card_note_type (id, name, kind, stock_kind, css, sort_field_ord, created_at, updated_at) VALUES (?, ?, 'normal', ?, ?, 0, ?, ?)`
    );
    const insertField = db.prepare(`INSERT OR IGNORE INTO card_note_field (note_type_id, ord, name, rtl, source_text) VALUES (?, ?, ?, ?, ?)`);
    const insertTemplate = db.prepare(`INSERT OR IGNORE INTO card_note_template (note_type_id, ord, name, front, back) VALUES (?, ?, ?, ?, ?)`);

    insertType.run(HADITH_VARIANTS_NOTE_TYPE_ID, 'Hadith (variants)', 'hadith_variants', ARABIC_CSS, now, now);
    HADITH_VARIANTS_FIELDS.forEach((f, ord) => insertField.run(HADITH_VARIANTS_NOTE_TYPE_ID, ord, f.name, ord < 5 ? 1 : 0, f.sourceText ? 1 : 0));
    HADITH_TEMPLATES.forEach((tpl, ord) => insertTemplate.run(HADITH_VARIANTS_NOTE_TYPE_ID, ord, tpl.name, tpl.front, tpl.back));

    insertType.run(NARRATOR_NOTE_TYPE_ID, 'Narrator', 'narrator', ARABIC_CSS, now, now);
    NARRATOR_FIELDS.forEach((f, ord) => insertField.run(NARRATOR_NOTE_TYPE_ID, ord, f.name, 1, 0));
    insertTemplate.run(NARRATOR_NOTE_TYPE_ID, 0, 'Narrator', '<div class="narrator">{{Name}}</div>', narratorBack);
  },
  down(db: Database) {
    for (const id of [HADITH_VARIANTS_NOTE_TYPE_ID, NARRATOR_NOTE_TYPE_ID]) {
      if (db.prepare(`SELECT 1 FROM card_note WHERE note_type_id = ? LIMIT 1`).get(id)) throw new Error('sunnah-deck-notes-exist');
      db.prepare(`DELETE FROM card_note_type WHERE id = ?`).run(id);
    }
  },
};

export default migration;
