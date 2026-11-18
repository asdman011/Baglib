/**
 * Baglib — Migration 035: poetry deck note types (KEY-397). Data only, no schema change.
 *
 * 1. "Poem (whole)": one card per poem — the title (and poet) on the front, the whole poem on the
 *    back, each bayt laid out as two hemistichs. Poem is a source-text field (ADR-006).
 * 2. The built-in "Progressive context cloze" type gets two option fields the template engine reads:
 *      - "Whole verse": when set, the whole bayt is hidden instead of only the ajuz;
 *      - "Chunk": the daily chunk size; the blurred lookahead then shows the rest of the chunk.
 *    Notes without them (all notes made before this) behave exactly as before.
 *    Its CSS gets the hemistich layout (sadr and ajuz side by side, wrapping on narrow screens), and
 *    its seeded back template, which repeated the hidden front, now reveals the bayt.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

export const POEM_WHOLE_NOTE_TYPE_ID = 'stock-poem-whole';
export const CONTEXT_CLOZE_NOTE_TYPE_ID = 'stock-context-cloze';

export const BAYT_CSS = `.bayt { display: flex; flex-wrap: wrap; justify-content: center; column-gap: 2.5em; margin: 0.15em 0; }
.bayt .sadr, .bayt .ajuz { display: inline-block; }
.context-before, .context-after { color: var(--muted, #555); font-size: 0.9em; }`;

const POEM_WHOLE_CSS = `.card { font-family: "Traditional Arabic", "Scheherazade New", Amiri, serif; font-size: 22px; text-align: center; color: var(--fg, black); background-color: transparent; line-height: 2.2; }
.poem-title { font-weight: bold; font-size: 1.15em; }
.poet, .notes { color: var(--muted, #555); font-size: 0.9em; }
${BAYT_CSS}`;

const OLD_CONTEXT_CLOZE_BACK = '{{FrontSide}}\n\n<hr id=answer>\n\n<div class="notes">{{Notes}}</div>';
export const CONTEXT_CLOZE_BACK =
  '<div class="context-before">{{Context Before}}</div>\n<div class="cloze-target">{{cloze:Target}}</div>\n<div class="context-after">{{Context After}}</div>\n\n<hr id=answer>\n\n<div class="notes">{{Notes}}</div>';

export const POEM_WHOLE_FIELDS: Array<{ name: string; sourceText: boolean }> = [
  { name: 'Title', sourceText: false },
  { name: 'Poet', sourceText: false },
  { name: 'Poem', sourceText: true },
  { name: 'Notes', sourceText: false },
];

const migration: Migration = {
  id: 35,
  name: 'poem_deck_note_types',
  up(db: Database) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO card_note_type (id, name, kind, stock_kind, css, sort_field_ord, created_at, updated_at) VALUES (?, 'Poem (whole)', 'normal', 'poetry', ?, 0, ?, ?)`
    ).run(POEM_WHOLE_NOTE_TYPE_ID, POEM_WHOLE_CSS, now, now);
    const insertField = db.prepare(`INSERT OR IGNORE INTO card_note_field (note_type_id, ord, name, rtl, source_text) VALUES (?, ?, ?, 1, ?)`);
    POEM_WHOLE_FIELDS.forEach((f, ord) => insertField.run(POEM_WHOLE_NOTE_TYPE_ID, ord, f.name, f.sourceText ? 1 : 0));
    db.prepare(`INSERT OR IGNORE INTO card_note_template (note_type_id, ord, name, front, back) VALUES (?, 0, 'Title → poem', ?, ?)`).run(
      POEM_WHOLE_NOTE_TYPE_ID,
      '<div class="poem-title">{{Title}}</div>\n{{#Poet}}<div class="poet">{{Poet}}</div>{{/Poet}}',
      '{{FrontSide}}\n\n<hr id=answer>\n<div class="poem">{{Poem}}</div>\n{{#Notes}}<div class="notes">{{Notes}}</div>{{/Notes}}'
    );

    const contextType = db.prepare(`SELECT css FROM card_note_type WHERE id = ?`).get(CONTEXT_CLOZE_NOTE_TYPE_ID) as { css: string } | undefined;
    if (contextType) {
      const optionField = db.prepare(`INSERT OR IGNORE INTO card_note_field (note_type_id, ord, name, rtl, source_text) VALUES (?, ?, ?, 0, 0)`);
      const names = new Set((db.prepare(`SELECT name FROM card_note_field WHERE note_type_id = ?`).all(CONTEXT_CLOZE_NOTE_TYPE_ID) as Array<{ name: string }>).map(r => r.name));
      let ord = (db.prepare(`SELECT COALESCE(MAX(ord), -1) AS ord FROM card_note_field WHERE note_type_id = ?`).get(CONTEXT_CLOZE_NOTE_TYPE_ID) as { ord: number }).ord;
      for (const name of ['Whole verse', 'Chunk']) if (!names.has(name)) optionField.run(CONTEXT_CLOZE_NOTE_TYPE_ID, ++ord, name);
      // The seeded back was {{FrontSide}}, which repeats the hidden front: the answer was never shown.
      // A back the user has edited is left alone.
      db.prepare(`UPDATE card_note_template SET back = ? WHERE note_type_id = ? AND ord = 0 AND back = ?`).run(CONTEXT_CLOZE_BACK, CONTEXT_CLOZE_NOTE_TYPE_ID, OLD_CONTEXT_CLOZE_BACK);
      if (!contextType.css.includes('.bayt')) {
        db.prepare(`UPDATE card_note_type SET css = ?, updated_at = ? WHERE id = ?`).run(`${contextType.css}\n${BAYT_CSS}`, now, CONTEXT_CLOZE_NOTE_TYPE_ID);
      }
    }
  },
};

export default migration;
