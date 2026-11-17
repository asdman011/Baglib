/**
 * Baglib — Migration 031: Decks, Presets, and Anki-Parity Scheduler (ADR-017 / KEY-389)
 *
 * 1. Creates `srs_preset` and seeds the undeletable `default` preset.
 * 2. Creates `deck`, `deck_card`, and `deck_subscription`, and seeds the built-in `memorization` deck.
 * 3. Adds `learning_step`, `buried_until`, `new_position`, and `desired_retention` to `srs_state`.
 * 4. Rebuilds `srs_review_log` with `rating` 0–4, `entry_kind`, `interval`, `last_interval`, `factor`, and `anki_id`,
 *    enforcing via triggers that `rating = 0` is allowed only for `reset` and `rescheduled`.
 * 5. Moves `collection` rows with `collection_type = 'deck'` and their `knowledge_collection` links into `deck` and `deck_card`,
 *    preserving shared cards across multiple decks, and deletes the old deck rows/links.
 * 6. Ensures every card in a deck (and every existing memorized card) has an `srs_state` row and deck membership.
 */

import type { Database } from 'better-sqlite3';
import type { Migration } from '../migrator';

export const DEFAULT_PRESET_ID = 'default';
export const MEMORIZATION_DECK_ID = 'memorization';

const migration: Migration = {
  id: 31,
  name: 'decks_and_scheduler',
  up(db: Database) {
    const now = new Date().toISOString();

    db.exec(`
      CREATE TABLE srs_preset (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        learn_steps TEXT NOT NULL DEFAULT '[1,10]',
        relearn_steps TEXT NOT NULL DEFAULT '[10]',
        new_per_day INTEGER NOT NULL DEFAULT 20,
        reviews_per_day INTEGER NOT NULL DEFAULT 200,
        desired_retention REAL NOT NULL DEFAULT 0.9 CHECK (desired_retention BETWEEN 0.7 AND 0.99),
        maximum_interval INTEGER NOT NULL DEFAULT 36500,
        bury_new INTEGER NOT NULL DEFAULT 0,
        bury_reviews INTEGER NOT NULL DEFAULT 0,
        bury_interday INTEGER NOT NULL DEFAULT 0,
        leech_threshold INTEGER NOT NULL DEFAULT 8,
        leech_action TEXT NOT NULL DEFAULT 'tag' CHECK (leech_action IN ('tag', 'suspend')),
        new_order TEXT NOT NULL DEFAULT 'position' CHECK (new_order IN ('position', 'random')),
        fsrs_params TEXT NULL,
        anki_id INTEGER NULL,
        anki_extra TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE deck (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parent_id TEXT NULL REFERENCES deck(id) ON DELETE RESTRICT,
        kind TEXT NOT NULL DEFAULT 'normal' CHECK (kind IN ('normal', 'filtered')),
        preset_id TEXT NULL REFERENCES srs_preset(id) ON DELETE SET NULL,
        filter_search TEXT NULL,
        filter_limit INTEGER NULL,
        filter_order TEXT NULL,
        filter_reschedule INTEGER NULL,
        description TEXT NULL,
        anki_id INTEGER NULL,
        anki_extra TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (parent_id, name)
      );

      CREATE UNIQUE INDEX idx_deck_top_name ON deck(name) WHERE parent_id IS NULL;
      CREATE INDEX idx_deck_parent ON deck(parent_id);

      CREATE TABLE deck_card (
        deck_id TEXT NOT NULL REFERENCES deck(id) ON DELETE CASCADE,
        knowledge_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL,
        PRIMARY KEY (deck_id, knowledge_id)
      );

      CREATE INDEX idx_deck_card_knowledge ON deck_card(knowledge_id);

      CREATE TABLE deck_subscription (
        id TEXT PRIMARY KEY,
        deck_id TEXT NOT NULL REFERENCES deck(id) ON DELETE CASCADE,
        source_kind TEXT NOT NULL CHECK (source_kind IN (
          'book_highlights',
          'book_comments',
          'sunnah_book',
          'sunnah_bab',
          'hadith_collection',
          'poem',
          'diwan',
          'poet',
          'list',
          'lexicon'
        )),
        source_ref TEXT NOT NULL,
        note_type_id TEXT NOT NULL REFERENCES card_note_type(id) ON DELETE RESTRICT,
        template_options TEXT NULL,
        new_items TEXT NOT NULL DEFAULT 'toast' CHECK (new_items IN ('silent', 'toast')),
        last_synced_at TEXT NULL
      );

      CREATE INDEX idx_deck_subscription_deck ON deck_subscription(deck_id);

      ALTER TABLE srs_state ADD COLUMN learning_step INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE srs_state ADD COLUMN buried_until TEXT NULL;
      ALTER TABLE srs_state ADD COLUMN new_position INTEGER NULL;
      ALTER TABLE srs_state ADD COLUMN desired_retention REAL NULL;

      CREATE INDEX idx_srs_state_buried ON srs_state(buried_until) WHERE buried_until IS NOT NULL;

      CREATE TABLE srs_review_log_new (
        id TEXT PRIMARY KEY,
        knowledge_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
        reviewed_at TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 4),
        duration_ms INTEGER,
        state_before TEXT,
        entry_kind TEXT NOT NULL DEFAULT 'review' CHECK (entry_kind IN ('learn', 'review', 'relearn', 'filtered', 'reset', 'rescheduled')),
        interval INTEGER NULL,
        last_interval INTEGER NULL,
        factor INTEGER NULL,
        anki_id INTEGER NULL
      );

      INSERT INTO srs_review_log_new (id, knowledge_id, reviewed_at, rating, duration_ms, state_before, entry_kind)
      SELECT id, knowledge_id, reviewed_at, rating, duration_ms, state_before, 'review'
      FROM srs_review_log;

      DROP TABLE srs_review_log;
      ALTER TABLE srs_review_log_new RENAME TO srs_review_log;

      CREATE INDEX idx_srs_review_log_card ON srs_review_log(knowledge_id, reviewed_at);
      CREATE UNIQUE INDEX idx_srs_review_log_anki_id ON srs_review_log(anki_id) WHERE anki_id IS NOT NULL;

      CREATE TRIGGER trg_srs_review_log_rating_insert
      BEFORE INSERT ON srs_review_log
      WHEN (NEW.rating = 0 AND NEW.entry_kind NOT IN ('reset', 'rescheduled'))
        OR (NEW.rating > 0 AND NEW.entry_kind IN ('reset', 'rescheduled'))
      BEGIN
        SELECT RAISE(ABORT, 'rating 0 is allowed only for reset and rescheduled entries');
      END;

      CREATE TRIGGER trg_srs_review_log_rating_update
      BEFORE UPDATE ON srs_review_log
      WHEN (NEW.rating = 0 AND NEW.entry_kind NOT IN ('reset', 'rescheduled'))
        OR (NEW.rating > 0 AND NEW.entry_kind IN ('reset', 'rescheduled'))
      BEGIN
        SELECT RAISE(ABORT, 'rating 0 is allowed only for reset and rescheduled entries');
      END;
    `);

    // Seed built-in Default preset
    db.prepare(`
      INSERT INTO srs_preset (
        id, name, learn_steps, relearn_steps, new_per_day, reviews_per_day,
        desired_retention, maximum_interval, bury_new, bury_reviews, bury_interday,
        leech_threshold, leech_action, new_order, fsrs_params, created_at, updated_at
      ) VALUES (
        ?, 'Default', '[1,10]', '[10]', 20, 200,
        0.9, 36500, 0, 0, 0,
        8, 'tag', 'position', NULL, ?, ?
      )
    `).run(DEFAULT_PRESET_ID, now, now);

    // Seed built-in Memorization deck
    db.prepare(`
      INSERT INTO deck (id, name, parent_id, kind, preset_id, description, created_at, updated_at)
      VALUES (?, 'Memorization', NULL, 'normal', ?, NULL, ?, ?)
    `).run(MEMORIZATION_DECK_ID, DEFAULT_PRESET_ID, now, now);

    // Move collection decks into deck table
    const oldDecks = db.prepare(`
      SELECT id, name, description
      FROM collection
      WHERE collection_type = 'deck'
      ORDER BY rowid ASC
    `).all() as Array<{ id: string; name: string | null; description: string | null }>;

    const insertDeck = db.prepare(`
      INSERT INTO deck (id, name, parent_id, kind, preset_id, description, created_at, updated_at)
      VALUES (?, ?, NULL, 'normal', NULL, ?, ?, ?)
    `);
    const findTopDeckByName = db.prepare(`
      SELECT id FROM deck WHERE parent_id IS NULL AND name = ?
    `);

    const deckIdMap = new Map<string, string>();
    for (const oldDeck of oldDecks) {
      const baseName = (oldDeck.name || 'Deck').trim() || 'Deck';
      const existing = findTopDeckByName.get(baseName) as { id: string } | undefined;
      if (existing) {
        deckIdMap.set(oldDeck.id, existing.id);
      } else {
        const targetId = oldDeck.id === MEMORIZATION_DECK_ID ? `${oldDeck.id}-migrated` : oldDeck.id;
        insertDeck.run(targetId, baseName, oldDeck.description ?? null, now, now);
        deckIdMap.set(oldDeck.id, targetId);
      }
    }

    // Move knowledge_collection links for those decks into deck_card
    if (oldDecks.length > 0) {
      const insertDeckCard = db.prepare(`
        INSERT OR IGNORE INTO deck_card (deck_id, knowledge_id, position, added_at)
        VALUES (?, ?, ?, ?)
      `);
      const selectLinks = db.prepare(`
        SELECT kc.knowledge_id, k.created_at
        FROM knowledge_collection kc
        JOIN knowledge k ON k.id = kc.knowledge_id
        WHERE kc.collection_id = ?
        ORDER BY k.created_at ASC, kc.knowledge_id ASC
      `);
      const deleteLinks = db.prepare(`DELETE FROM knowledge_collection WHERE collection_id = ?`);
      const deleteCollection = db.prepare(`DELETE FROM collection WHERE id = ?`);

      const deckPositionCounters = new Map<string, number>();

      for (const oldDeck of oldDecks) {
        const targetDeckId = deckIdMap.get(oldDeck.id)!;
        let pos = deckPositionCounters.get(targetDeckId) ?? 0;
        const links = selectLinks.all(oldDeck.id) as Array<{ knowledge_id: string; created_at: string | null }>;
        for (const link of links) {
          pos += 1;
          insertDeckCard.run(targetDeckId, link.knowledge_id, pos, link.created_at || now);
        }
        deckPositionCounters.set(targetDeckId, pos);
        deleteLinks.run(oldDeck.id);
        deleteCollection.run(oldDeck.id);
      }
    }

    // Ensure any card that already had an active srs_state (from setMemorizing before migration 031)
    // and is not in any deck is linked to the built-in Memorization deck
    const unlinkedSrsCards = db.prepare(`
      SELECT s.knowledge_id, k.created_at
      FROM srs_state s
      JOIN knowledge k ON k.id = s.knowledge_id
      LEFT JOIN deck_card dc ON dc.knowledge_id = s.knowledge_id
      WHERE dc.knowledge_id IS NULL AND s.state <> 'suspended'
      ORDER BY k.created_at ASC, s.knowledge_id ASC
    `).all() as Array<{ knowledge_id: string; created_at: string | null }>;

    if (unlinkedSrsCards.length > 0) {
      const insertMemCard = db.prepare(`
        INSERT OR IGNORE INTO deck_card (deck_id, knowledge_id, position, added_at)
        VALUES (?, ?, ?, ?)
      `);
      let memPos = 0;
      for (const c of unlinkedSrsCards) {
        memPos += 1;
        insertMemCard.run(MEMORIZATION_DECK_ID, c.knowledge_id, memPos, c.created_at || now);
      }
    }

    // Every card in a deck that has no srs_state gets one in state 'new'
    const cardsMissingSrs = db.prepare(`
      SELECT dc.knowledge_id, MIN(dc.position) AS pos
      FROM deck_card dc
      LEFT JOIN srs_state s ON s.knowledge_id = dc.knowledge_id
      WHERE s.knowledge_id IS NULL
      GROUP BY dc.knowledge_id
    `).all() as Array<{ knowledge_id: string; pos: number }>;

    if (cardsMissingSrs.length > 0) {
      const insertSrs = db.prepare(`
        INSERT OR IGNORE INTO srs_state (
          knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review,
          learning_step, buried_until, new_position, desired_retention
        ) VALUES (?, 'new', ?, NULL, NULL, 0, 0, NULL, 0, NULL, ?, NULL)
      `);
      for (const c of cardsMissingSrs) {
        insertSrs.run(c.knowledge_id, now, c.pos);
      }
    }
  },

  down(db: Database) {
    // 1. Restore normal decks and deck_card links back into collection and knowledge_collection
    const decks = db.prepare(`
      SELECT id, name, description
      FROM deck
      WHERE kind = 'normal' AND (id <> ? OR EXISTS (SELECT 1 FROM deck_card WHERE deck_id = ?))
    `).all(MEMORIZATION_DECK_ID, MEMORIZATION_DECK_ID) as Array<{
      id: string;
      name: string;
      description: string | null;
    }>;

    const insertCol = db.prepare(`
      INSERT OR IGNORE INTO collection (id, name, description, collection_type)
      VALUES (?, ?, ?, 'deck')
    `);
    for (const d of decks) {
      insertCol.run(d.id, d.name, d.description);
    }

    const deckCards = db.prepare(`
      SELECT deck_id, knowledge_id FROM deck_card
    `).all() as Array<{ deck_id: string; knowledge_id: string }>;

    const insertKc = db.prepare(`
      INSERT OR IGNORE INTO knowledge_collection (knowledge_id, collection_id)
      VALUES (?, ?)
    `);
    for (const dc of deckCards) {
      insertKc.run(dc.knowledge_id, dc.deck_id);
    }

    // 2. Keep rating-0 rows in a backup table before rebuilding srs_review_log
    db.exec(`
      CREATE TABLE IF NOT EXISTS srs_review_log_rating0_backup (
        id TEXT PRIMARY KEY,
        knowledge_id TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        rating INTEGER NOT NULL,
        duration_ms INTEGER,
        state_before TEXT,
        entry_kind TEXT NOT NULL,
        interval INTEGER NULL,
        last_interval INTEGER NULL,
        factor INTEGER NULL,
        anki_id INTEGER NULL
      );

      INSERT OR REPLACE INTO srs_review_log_rating0_backup (
        id, knowledge_id, reviewed_at, rating, duration_ms, state_before,
        entry_kind, interval, last_interval, factor, anki_id
      )
      SELECT
        id, knowledge_id, reviewed_at, rating, duration_ms, state_before,
        entry_kind, interval, last_interval, factor, anki_id
      FROM srs_review_log
      WHERE rating = 0;

      DROP TRIGGER IF EXISTS trg_srs_review_log_rating_insert;
      DROP TRIGGER IF EXISTS trg_srs_review_log_rating_update;
      DROP INDEX IF EXISTS idx_srs_review_log_anki_id;
      DROP INDEX IF EXISTS idx_srs_review_log_card;

      CREATE TABLE srs_review_log_old (
        id TEXT PRIMARY KEY,
        knowledge_id TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
        reviewed_at TEXT NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
        duration_ms INTEGER,
        state_before TEXT
      );

      INSERT INTO srs_review_log_old (id, knowledge_id, reviewed_at, rating, duration_ms, state_before)
      SELECT id, knowledge_id, reviewed_at, rating, duration_ms, state_before
      FROM srs_review_log
      WHERE rating BETWEEN 1 AND 4;

      DROP TABLE srs_review_log;
      ALTER TABLE srs_review_log_old RENAME TO srs_review_log;

      CREATE INDEX idx_srs_review_log_card ON srs_review_log(knowledge_id, reviewed_at);

      DROP INDEX IF EXISTS idx_srs_state_buried;
      ALTER TABLE srs_state DROP COLUMN learning_step;
      ALTER TABLE srs_state DROP COLUMN buried_until;
      ALTER TABLE srs_state DROP COLUMN new_position;
      ALTER TABLE srs_state DROP COLUMN desired_retention;

      DROP INDEX IF EXISTS idx_deck_subscription_deck;
      DROP TABLE IF EXISTS deck_subscription;
      DROP INDEX IF EXISTS idx_deck_card_knowledge;
      DROP TABLE IF EXISTS deck_card;
      DROP INDEX IF EXISTS idx_deck_parent;
      DROP INDEX IF EXISTS idx_deck_top_name;
      DROP TABLE IF EXISTS deck;
      DROP TABLE IF EXISTS srs_preset;
    `);
  },
};

export default migration;
