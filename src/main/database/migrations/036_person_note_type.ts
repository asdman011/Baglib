/**
 * Baglib — Migration 036: the built-in "Person" note type (KEY-401). Data only, no schema change.
 *
 * One card per person — a library author, a scholar, or a Wikipedia article: the name (or article
 * title) on the front; on the back only the details that are filled in: era and dates, main works,
 * field, a short biography or summary, and the source (for Wikipedia, the link and language edition).
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

export const PERSON_NOTE_TYPE_ID = 'stock-person';

export const PERSON_FIELDS = ['Name', 'Era', 'Works', 'Field', 'Bio', 'Source'] as const;

const CSS = `.card { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Naskh Arabic", "Traditional Arabic", sans-serif; font-size: 20px; text-align: start; color: var(--fg, black); background-color: transparent; line-height: 1.8; }
.person-name { font-weight: bold; font-size: 1.2em; text-align: center; }
.person-field { margin: 4px 0; }
.person-bio { margin-top: 8px; }
.person-source { margin-top: 10px; font-size: 0.85em; color: var(--muted, #555); }`;

const FRONT = '<div class="person-name" dir="auto">{{Name}}</div>';
const BACK = [
  '{{FrontSide}}',
  '',
  '<hr id=answer>',
  '{{#Era}}<div class="person-field" dir="auto">{{Era}}</div>{{/Era}}',
  '{{#Works}}<div class="person-field" dir="auto">{{Works}}</div>{{/Works}}',
  '{{#Field}}<div class="person-field" dir="auto">{{Field}}</div>{{/Field}}',
  '{{#Bio}}<div class="person-bio" dir="auto">{{Bio}}</div>{{/Bio}}',
  '{{#Source}}<div class="person-source" dir="auto">{{Source}}</div>{{/Source}}',
].join('\n');

const migration: Migration = {
  id: 36,
  name: 'person_note_type',
  up(db: Database) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO card_note_type (id, name, kind, stock_kind, css, sort_field_ord, created_at, updated_at) VALUES (?, 'Person', 'normal', 'person', ?, 0, ?, ?)`
    ).run(PERSON_NOTE_TYPE_ID, CSS, now, now);
    const insertField = db.prepare(`INSERT OR IGNORE INTO card_note_field (note_type_id, ord, name, rtl, source_text) VALUES (?, ?, ?, 0, 0)`);
    PERSON_FIELDS.forEach((name, ord) => insertField.run(PERSON_NOTE_TYPE_ID, ord, name));
    db.prepare(`INSERT OR IGNORE INTO card_note_template (note_type_id, ord, name, front, back) VALUES (?, 0, 'Name → details', ?, ?)`).run(PERSON_NOTE_TYPE_ID, FRONT, BACK);
  },
};

export default migration;
