/**
 * Migration 001 — Initial Library Domain Schema
 *
 * Strictly matches the approved schema in docs/baglib-library-domain-schema (2).dbml
 *
 * Tables (24):
 *   1. Core Catalog:       work_type, work, author, work_author, edition, source,
 *                          file_source_detail, physical_source_detail, wishlist_source_detail
 *   2. Knowledge Layer:    knowledge, note_detail, highlight_detail, quote_detail,
 *                          bookmark_detail, question_detail
 *   3. Activity & Social:  reading_session, comment, event_log
 *   4. Organization:       tag, collection, work_tag, knowledge_tag,
 *                          work_collection, knowledge_collection
 */

import type { Migration } from '../migrator';

const migration: Migration = {
  id: 1,
  name: 'initial_schema',

  up(db) {
    db.exec(`
      -- =========================================================================
      -- 1. CORE CATALOG
      -- =========================================================================

      -- Work type lookup (book, research_paper, video, podcast, lecture, ...)
      CREATE TABLE IF NOT EXISTS work_type (
        id   TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT
      );

      -- Seed default work types
      INSERT OR IGNORE INTO work_type (id, name, icon) VALUES
        ('wt-book',            'كتاب',           'book-open'),
        ('wt-research-paper',  'بحث أكاديمي',    'file-text'),
        ('wt-article',         'مقالة',           'newspaper'),
        ('wt-video',           'فيديو',           'video'),
        ('wt-podcast',         'بودكاست',         'headphones'),
        ('wt-lecture',         'محاضرة',          'presentation'),
        ('wt-thesis',          'رسالة علمية',     'graduation-cap'),
        ('wt-manuscript',      'مخطوطة',          'scroll');

      -- Abstract intellectual work, independent of physical/digital edition.
      CREATE TABLE IF NOT EXISTS work (
        id                TEXT PRIMARY KEY,
        work_type_id      TEXT REFERENCES work_type(id),
        title             TEXT NOT NULL,
        original_language TEXT,
        description       TEXT,
        external_ref      TEXT,
        created_at        TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_work_title     ON work(title);
      CREATE INDEX IF NOT EXISTS idx_work_type_id   ON work(work_type_id);

      -- Authors / contributors (author, translator, editor, narrator, ...)
      CREATE TABLE IF NOT EXISTS author (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        birth_year TEXT,
        death_year TEXT,
        bio        TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_author_name ON author(name);

      -- Many-to-many: which people contributed to which work, and in what role.
      CREATE TABLE IF NOT EXISTS work_author (
        work_id   TEXT REFERENCES work(id) ON DELETE CASCADE,
        author_id TEXT REFERENCES author(id) ON DELETE CASCADE,
        role      TEXT,
        PRIMARY KEY (work_id, author_id, role)
      );

      -- A specific edition of a work
      CREATE TABLE IF NOT EXISTS edition (
        id               TEXT PRIMARY KEY,
        work_id          TEXT REFERENCES work(id) ON DELETE CASCADE,
        label            TEXT,
        publisher        TEXT,
        publication_year INTEGER,
        language         TEXT,
        isbn             TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_edition_work_id ON edition(work_id);

      -- Access point to an edition: file, physical copy, or wishlist entry.
      CREATE TABLE IF NOT EXISTS source (
        id          TEXT PRIMARY KEY,
        edition_id  TEXT REFERENCES edition(id) ON DELETE CASCADE,
        source_type TEXT,
        status      TEXT,
        added_at    TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_source_edition_id ON source(edition_id);

      -- Detail table for digital file sources
      CREATE TABLE IF NOT EXISTS file_source_detail (
        source_id   TEXT PRIMARY KEY REFERENCES source(id) ON DELETE CASCADE,
        file_path   TEXT,
        file_hash   TEXT,
        file_format TEXT,
        is_managed  INTEGER
      );

      -- Detail table for physical copy sources
      CREATE TABLE IF NOT EXISTS physical_source_detail (
        source_id      TEXT PRIMARY KEY REFERENCES source(id) ON DELETE CASCADE,
        shelf          TEXT,
        room           TEXT,
        condition      TEXT,
        lending_status TEXT,
        purchase_date  TEXT,
        price          REAL
      );

      -- Detail table for wishlist entries
      CREATE TABLE IF NOT EXISTS wishlist_source_detail (
        source_id     TEXT PRIMARY KEY REFERENCES source(id) ON DELETE CASCADE,
        priority      INTEGER,
        target_format TEXT,
        notes         TEXT
      );

      -- =========================================================================
      -- 2. KNOWLEDGE LAYER
      -- =========================================================================

      -- Knowledge item attached to a work (note, highlight, quote, bookmark, question)
      CREATE TABLE IF NOT EXISTS knowledge (
        id             TEXT PRIMARY KEY,
        work_id        TEXT REFERENCES work(id) ON DELETE CASCADE,
        edition_id     TEXT REFERENCES edition(id) ON DELETE SET NULL,
        source_id      TEXT REFERENCES source(id) ON DELETE SET NULL,
        knowledge_type TEXT,
        location       TEXT,
        created_at     TEXT,
        updated_at     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_knowledge_work_id ON knowledge(work_id);

      CREATE TABLE IF NOT EXISTS note_detail (
        knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
        content      TEXT
      );

      CREATE TABLE IF NOT EXISTS highlight_detail (
        knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
        quoted_text  TEXT,
        color        TEXT
      );

      CREATE TABLE IF NOT EXISTS quote_detail (
        knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
        quoted_text  TEXT,
        context_note TEXT
      );

      CREATE TABLE IF NOT EXISTS bookmark_detail (
        knowledge_id TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
        label        TEXT
      );

      CREATE TABLE IF NOT EXISTS question_detail (
        knowledge_id  TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
        question_text TEXT
      );

      -- =========================================================================
      -- 3. ACTIVITY & SOCIAL
      -- =========================================================================

      -- Reading session tracking
      CREATE TABLE IF NOT EXISTS reading_session (
        id         TEXT PRIMARY KEY,
        work_id    TEXT REFERENCES work(id) ON DELETE CASCADE,
        edition_id TEXT REFERENCES edition(id) ON DELETE SET NULL,
        started_at TEXT,
        ended_at   TEXT,
        pages_read INTEGER,
        mood       TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_reading_session_work_id ON reading_session(work_id);

      -- Threaded comments on knowledge items
      CREATE TABLE IF NOT EXISTS comment (
        id                TEXT PRIMARY KEY,
        knowledge_id      TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
        parent_comment_id TEXT REFERENCES comment(id) ON DELETE CASCADE,
        content           TEXT NOT NULL,
        actor             TEXT,
        created_at        TEXT,
        updated_at        TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_comment_knowledge_id ON comment(knowledge_id);

      -- Append-only event log for history/audit
      CREATE TABLE IF NOT EXISTS event_log (
        id          TEXT PRIMARY KEY,
        entity_type TEXT,
        entity_id   TEXT,
        event_type  TEXT,
        payload     TEXT,
        actor       TEXT,
        occurred_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_event_log_entity ON event_log(entity_type, entity_id);

      -- =========================================================================
      -- 4. ORGANIZATION (Tags & Collections)
      -- =========================================================================

      CREATE TABLE IF NOT EXISTS tag (
        id       TEXT PRIMARY KEY,
        name     TEXT UNIQUE,
        origin   TEXT NOT NULL DEFAULT 'manual',
        category TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(name);

      CREATE TABLE IF NOT EXISTS collection (
        id              TEXT PRIMARY KEY,
        name            TEXT,
        description     TEXT,
        collection_type TEXT NOT NULL DEFAULT 'manual',
        filter_rules    TEXT
      );

      CREATE TABLE IF NOT EXISTS work_tag (
        work_id TEXT REFERENCES work(id) ON DELETE CASCADE,
        tag_id  TEXT REFERENCES tag(id) ON DELETE CASCADE,
        PRIMARY KEY (work_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS knowledge_tag (
        knowledge_id TEXT REFERENCES knowledge(id) ON DELETE CASCADE,
        tag_id       TEXT REFERENCES tag(id) ON DELETE CASCADE,
        PRIMARY KEY (knowledge_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS work_collection (
        work_id       TEXT REFERENCES work(id) ON DELETE CASCADE,
        collection_id TEXT REFERENCES collection(id) ON DELETE CASCADE,
        PRIMARY KEY (work_id, collection_id)
      );

      CREATE TABLE IF NOT EXISTS knowledge_collection (
        knowledge_id  TEXT REFERENCES knowledge(id) ON DELETE CASCADE,
        collection_id TEXT REFERENCES collection(id) ON DELETE CASCADE,
        PRIMARY KEY (knowledge_id, collection_id)
      );
    `);
  },
};

export default migration;
