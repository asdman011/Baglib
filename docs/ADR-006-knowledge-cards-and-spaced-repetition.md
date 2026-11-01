# ADR-006: Knowledge Cards and Spaced Repetition Data Model

## Status
Accepted. The user approved the three tables and FSRS on 2026-11-01 (KEY-231). The user approved `ts-fsrs` 5.3.1 the same day.

## Context
The Baglib board makes the SRS "dependent on the knowledge cards". Cards open from hover or selection in the reader, Quran, Sunnah and poetry views, and can be added to memorization.

Verified in the code:

- `knowledge` is a parent table with one detail table per type: `note_detail`, `highlight_detail`, `quote_detail`, `bookmark_detail` and `question_detail`.
- `knowledge.work_id` is nullable, so a row does not have to belong to a library Work.
- `tag`, `knowledge_tag`, `knowledge_collection` and `comment` already attach to `knowledge`.
- Before this decision, `KnowledgeCardSection.tsx` was an unmounted mock, and nothing stored a card or a review.
- Study notes do not use `knowledge`. They are JSON under `study.note.v1:<id>` settings keys.

Quran ayahs and hadith are not library Works, and must not become ordinary books (ADR-004, ADR-005).

## Options

| Option | For | Against |
| --- | --- | --- |
| A. New `knowledge` type with `card_detail`, plus SRS tables | Reuses tags, comments and collections, and follows the existing pattern | Rows without a Work must be handled by queries that assume one |
| B. A separate card system | Fully isolated | Duplicates tags and comments, and adds a second knowledge model |
| C. JSON in settings, like study notes | No migration | Cannot query due cards efficiently at scale |

## Decision
Use Option A. Add three tables in one migration:

```sql
CREATE TABLE card_detail (
  knowledge_id  TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
  front         TEXT NOT NULL,
  back          TEXT NOT NULL,
  source_kind   TEXT NOT NULL,  -- book, quran, hadith, poetry, note, term, person
  source_ref    TEXT,           -- for example quran:2:255 or hadith:1234
  source_label  TEXT,           -- attribution shown on the card
  language      TEXT
);

CREATE TABLE srs_state (
  knowledge_id  TEXT PRIMARY KEY REFERENCES knowledge(id) ON DELETE CASCADE,
  state         TEXT NOT NULL,  -- new, learning, review, relearning, suspended
  due_at        TEXT NOT NULL,
  stability     REAL,
  difficulty    REAL,
  reps          INTEGER NOT NULL DEFAULT 0,
  lapses        INTEGER NOT NULL DEFAULT 0,
  last_review   TEXT
);
CREATE INDEX idx_srs_state_due ON srs_state(due_at);

CREATE TABLE srs_review_log (
  id            TEXT PRIMARY KEY,
  knowledge_id  TEXT NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
  reviewed_at   TEXT NOT NULL,
  rating        INTEGER NOT NULL,  -- 1 again, 2 hard, 3 good, 4 easy
  duration_ms   INTEGER,
  state_before  TEXT
);
CREATE INDEX idx_srs_review_log_card ON srs_review_log(knowledge_id, reviewed_at);
```

Rules:

- A lookup result stays transient. A `card_detail` row is created only when the user saves a card.
- `knowledge_type` is `card`. `work_id` is set only for cards from a library book.
- `srs_state` exists only for cards added to memorization, so saving a card does not schedule it.
- `srs_review_log` is append-only. It feeds the dashboard and allows schedules to be recomputed.
- Sacred text stays exact. Quran and hadith cards keep `source_ref`, and show canonical text from the source where it is installed. `front` and `back` hold a verbatim copy for offline use and export, never reworded text.
- Personal comments stay in `comment`, separate from source text.
- Search normalizes derived forms only. Stored text is unchanged.

## Scheduler
Use FSRS rather than SM-2. FSRS schedules from each card's stability and difficulty, and `srs_state` and `srs_review_log` store what it needs. SM-2 needs no dependency but gives simpler scheduling.

The implementation is the TypeScript `ts-fsrs` package, version 5.3.1, pinned exactly.

## Consequences

- Existing queries on `knowledge` that assume a Work must be reviewed, because cards can have none.
- Deleting a book never deletes knowledge. The user decided on 2026-11-01 that cards, review history and all connected knowledge stay. Migration 019 detaches them through a `BEFORE DELETE` trigger on `work`, keeps the book title in `former_work_title`, and rebuilds `annotations` so `book_id` can be empty. Migration 018 holds the card and review tables.
- Snapshots copy the whole database, so cards and reviews are already included.
- Study notes stay where they are. "Export Notes to our SRS" creates cards from them.
- Anki export needs a stable GUID per card, and the `knowledge.id` can serve as that.

## Decisions for the user

None open.
