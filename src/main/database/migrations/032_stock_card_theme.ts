/**
 * Baglib — Migration 032: theme-aware CSS for the built-in note types (KEY-407)
 *
 * Migration 030 seeded the stock note types with Anki's hard-coded `color: black; background-color: white`,
 * which painted a white strip inside the dark app. Profiles created after this change get the
 * theme-aware CSS straight from 030; this migration rewrites the same declarations in profiles
 * that already ran 030. Only built-in (`stock-*`) note types are touched, and only the exact stock
 * declarations, so a user's own edits to that CSS are kept. The fallbacks (`black`, `blue`) keep
 * the CSS correct when it is exported to Anki, where the variables are not defined.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

const REPLACEMENTS: Array<[string, string]> = [
  ['color: black; background-color: white;', 'color: var(--fg, black); background-color: transparent;'],
  ['.cloze { font-weight: bold; color: blue; }', '.cloze { font-weight: bold; color: var(--cloze, blue); }'],
  ['.cloze { font-weight: bold; color: #1d4ed8; }', '.cloze { font-weight: bold; color: var(--cloze, #1d4ed8); }'],
];

const migration: Migration = {
  id: 32,
  name: 'stock_card_theme',
  up(db: Database) {
    const update = db.prepare(
      `UPDATE card_note_type SET css = replace(css, ?, ?) WHERE id LIKE 'stock-%' AND instr(css, ?) > 0`
    );
    for (const [from, to] of REPLACEMENTS) update.run(from, to, from);
  },
  down(db: Database) {
    const update = db.prepare(
      `UPDATE card_note_type SET css = replace(css, ?, ?) WHERE id LIKE 'stock-%' AND instr(css, ?) > 0`
    );
    for (const [from, to] of REPLACEMENTS) update.run(to, from, to);
  },
};

export default migration;
