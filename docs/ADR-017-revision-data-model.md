# ADR-017: Revision data model (notes, note types, decks, presets and Anki round-trip)

- **Status:** **Accepted.** The user approved revision 2 on 2026-11-17, including the later clarifications in sections 3.8 (sharing is decided by the note) and 3.11 (source text is editable by default). It is **approved but not yet built**: migration 030 is implemented in KEY-389, KEY-390, KEY-392 and KEY-393.
- **Drafted by:** Claude Code, for KEY-388.
- **Epic:** KEY-387 (Revision Epic).
- **This ADR gates:**
  - KEY-389 (scheduler);
  - KEY-390 (note types);
  - KEY-392 (`.apkg`);
  - KEY-393 (live sync);
  - indirectly, every later revision task.
- **Related:**
  - ADR-006 (cards and SRS, migration 018);
  - ADR-008 (version history);
  - ADR-013 (question kinds and practice attempts, migration 026);
  - `docs/features/feature - Revision System Investigation.md` (the evidence).

## Decisions already made by the user (2026-11-17)

| # | Question | Decision |
|---|---|---|
| 1 | Approach | **Option B:** BagLib's own model shaped like Anki's, plus a lossless `.apkg` converter |
| 2 | When a new day starts | **4 AM by default**, with a Settings option for **midnight** |
| 3 | Where notes live | **A table of their own** |
| 4 | Anki's rating-0 history entries | Not reviews. Treated as **"reset to new"** markers, following Anki's new / learning / review mechanism (see 3.6) |
| 5 | Cards in several decks | Left to Claude to choose. The choice is **shared until edited, with a prompt on every edit** (see 3.8) |
| — | Design freedom | The app hasn't shipped, so restructuring existing tables is fine. Choose what's best in the long run, not what avoids new tables. |

---

## 1. Context

**What BagLib has** (verified in code):
- **Cards.** A card is a `knowledge` row (`knowledge_type='card'`) with `card_detail` holding `front`, `back`, `source_kind`, `source_ref`, `source_label`, `language`, `question_kind` and `payload_json`.
- **Scheduling.** `srs_state` holds one schedule per card. `srs_review_log` has `CHECK (rating BETWEEN 1 AND 4)`.
- **No notes.** There is no "note" that produces sibling cards.
- **Decks** are `collection(collection_type='deck')` rows linked through `knowledge_collection`.
  - Saving the same ayah again returns the **existing** card (`KnowledgeCardRepository.save`), so one card is already shared by several decks.
  - Editing a shared card changes it everywhere.
  - Editing Quran, hadith and poetry cards is refused.
- **These services read `srs_review_log`:**
  - `study-insights.service.ts`;
  - `workspace-statistics.service.ts`;
  - `study-progress.service.ts`;
  - `study-prerequisites.service.ts`.
- **The day boundary is local midnight**, hard-coded in `srs.ts`.

**What is needed** (verified in the Anki 26.09.4 source and the user's collection):
- **Sibling cards.** 2,730 of the user's 3,051 notes have more than one card. Burying siblings (KEY-389) and the hadith variants (KEY-396) both need to know which cards share a note.
- **Note types:** fields, templates and conditional generation. Editing a note only ever adds cards.
- **A lossless round-trip** of the user's collection:
  - 6,503 cards;
  - 46,622 history entries, of which **30,342 are "reset to new" markers with rating 0** (30,013 from one bulk reset on 2024-07-12, mostly for cards deleted since);
  - FSRS state on 2,002 cards;
  - a 43-deck tree;
  - 5 deck presets.
- **Scheduler parity:** a rollover hour, learning steps, burying, per-deck presets, filtered decks, and the new / learning / review / relearning states with daily limits.
- **Live sync (KEY-393):** decks that follow a source, plus per-note source tracking.

**Constraints that still apply:**
- Cards stay `knowledge` rows, so tags, comments, history, trash and book-deletion survival keep working without being built twice.
- No changes to Work, Edition or Source.
- **BagLib never rewords source text by itself.** Templates and sync copy Quran, hadith and poetry text exactly. **The user may edit it** (the user's decision on 2026-11-17, section 3.11), because datasets can be wrong or incomplete: a missing word, a narrator's name spelled wrongly, or a related ayah the user wants to add. BagLib always keeps the original source text, so it can be compared or restored.

## 2. Options (decided: B)

| Option | For | Against |
|---|---|---|
| A. Move cards into Anki-style tables | The layout matches Anki's file | Every feature that works on `knowledge` (tags, comments, history, trash, book-deletion survival) would need rebuilding for the new tables, or would run twice in parallel. It also brings in Anki internals: protobuf settings blobs, a due field whose meaning depends on the queue, sync counters. |
| **B. BagLib's own model with Anki's concepts, plus a lossless converter** (chosen) | One knowledge system. Every Anki concept has a proper home. The `.apkg` file stays Anki's exact format, because the converter translates on import and export. | The converter must translate carefully (KEY-392). |
| C. No change | — | Doesn't meet KEY-387 |

"Lossless" means: import the user's collection, export it, open the export in Anki, and get the same notes, cards, deck tree, tags, media, FSRS memory, due dates (to the day) and history.

---

## 3. Decision: the model

### 3.1 `card_note_type`: how a kind of card is built

| Column | Type / constraints | Meaning |
|---|---|---|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | Kept exactly as written, for example "حديث" |
| kind | TEXT NOT NULL CHECK in (`normal`, `cloze`, `image_occlusion`, `context_cloze`, `choice`) | How cards are generated. `context_cloze` is BagLib's poetry and isnad type. `choice` is multiple choice (ADR-013). |
| stock_kind | TEXT NULL | `basic`, `basic_reversed`, `basic_optional_reversed`, `basic_typing`, `cloze`, `image_occlusion`, or a BagLib built-in. Built-ins can be copied but not deleted. |
| css | TEXT NOT NULL DEFAULT '' | Applied only inside the sandboxed card frame (KEY-390) |
| sort_field_ord | INTEGER NOT NULL DEFAULT 0 | The field used for sorting and the browser column |
| anki_id | INTEGER NULL | For re-import matching |
| anki_extra | TEXT NULL | Opaque JSON for Anki settings BagLib doesn't use (LaTeX header and so on), kept for re-export |
| created_at, updated_at | TEXT NOT NULL | UTC ISO |

Fields and templates get **their own tables**, not JSON, so renaming a field or adding a template is a clean row change, and Anki's per-field and per-template ids survive merges:

**`card_note_field`:**
- `(note_type_id FK, ord)` PRIMARY KEY;
- `name`, with a UNIQUE index per type;
- `rtl` (0 or 1), `font`, `size_px`;
- `source_text` (0 or 1): marks the field as holding Quran, hadith or poetry text taken from a source. It is editable by default; the protection setting in 3.11 can make it read-only;
- `anki_id`.

**`card_note_template`:**
- `(note_type_id FK, ord)` PRIMARY KEY;
- `name`, with a UNIQUE index per type;
- `front` and `back`, in Anki template syntax;
- `anki_id`.

### 3.2 `card_note`: the note (its own table)

| Column | Type / constraints | Meaning |
|---|---|---|
| id | TEXT PK | UUID |
| note_type_id | TEXT NOT NULL FK → card_note_type | Deleting a type that still has notes is refused |
| fields_json | TEXT NOT NULL | `{fieldName: html}`. At most 20,000 characters per field. Fields marked `source_text` are filled from the source, and the user may edit them (3.11). |
| guid | TEXT NOT NULL UNIQUE | Anki identity. New notes get a random GUID; imported notes keep Anki's. |
| copied_from_note_id | TEXT NULL FK → card_note ON DELETE SET NULL | Set when this note is a deck-only copy (3.8) |
| source_ref | TEXT NULL | What generated the note, for example `quran:2:255`, `hadith:…`, `knowledge:<id>` or `list:<id>/<item>` |
| source_snapshot_json | TEXT NULL | The **original** value of every `source_text` field, exactly as it came from the source. Used to show "edited by you", to compare and to restore. Never changed by user edits. |
| source_hash | TEXT NULL | A hash of the source content the note was last built from |
| source_changed_at | TEXT NULL | Set when the source has changed but this note was **not** updated automatically. Used for copies (3.8); the user is asked. |
| orphaned_at | TEXT NULL | Set when the source is gone. Its cards are suspended, the user confirms on "Orphaned cards", and history is always kept. |
| anki_id | INTEGER NULL | |
| anki_extra | TEXT NULL | Anki `flags` and `data` |
| created_at, updated_at | TEXT NOT NULL | |

Indexes: `note_type_id`, a partial index on `source_ref`, a partial index on `copied_from_note_id`, and partial indexes on `source_changed_at` and on `orphaned_at`.

**Tags and comments** stay on cards (`knowledge_tag`, `comment`). Import copies a note's tags onto each of its cards. Export writes the union of its cards' tags. Editing tags in the note editor applies them to all its cards.

### 3.3 Card ↔ note: new columns on `card_detail`

| Column | Meaning |
|---|---|
| note_id TEXT NULL FK → card_note ON DELETE SET NULL | The note that generated the card. Deleting a note never deletes cards or history; deleting cards is a separate, confirmed action. |
| ord INTEGER NULL | The template ordinal, or the cloze number minus 1. `UNIQUE(note_id, ord) WHERE note_id IS NOT NULL`. |
| anki_id INTEGER NULL | |
| anki_extra TEXT NULL | Anki `cards.flags`, plus `cards.data` keys BagLib doesn't use |

`front` and `back` stay as the **rendered text** of each card. They are regenerated whenever its note or template changes, so search, text export and statistics keep working. When a card has a note, the note is the source of truth.

### 3.4 Decks: dedicated tables, replacing `collection` decks

The app hasn't shipped, so decks get proper tables instead of JSON in `collection.filter_rules`. Migration 030 moves the existing `collection_type='deck'` rows and their links into these tables, then removes them from `collection`.

**`deck`:**

| Column | Type / constraints | Meaning |
|---|---|---|
| id | TEXT PK | |
| name | TEXT NOT NULL | One level of the name only, for example "78 - كتاب الأدب" |
| parent_id | TEXT NULL FK → deck ON DELETE RESTRICT | The tree. Anki's `A::B` is built and parsed only at the `.apkg` boundary. `UNIQUE(parent_id, name)`. |
| kind | TEXT NOT NULL CHECK in (`normal`, `filtered`) | |
| preset_id | TEXT NULL FK → srs_preset | Null means inherit from the parent, and at the top level the Default preset |
| filter_search | TEXT NULL | Filtered decks only: the search, for example `prop:r<0.85 source:sunnah` |
| filter_limit | INTEGER NULL | |
| filter_order | TEXT NULL | |
| filter_reschedule | INTEGER NULL | Whether answers in a filtered deck reschedule cards (Anki's option) |
| description | TEXT NULL | |
| anki_id | INTEGER NULL | |
| anki_extra | TEXT NULL | |
| created_at, updated_at | TEXT NOT NULL | |

**`deck_card`:** which cards are in which normal deck. A card can be in **several** decks (3.8).
- Columns: `deck_id` FK, `knowledge_id` FK, `position`, `added_at`.
- PRIMARY KEY `(deck_id, knowledge_id)`, plus an index on `knowledge_id`.
- `position` is the order new cards are introduced, used by the poetry chunks in KEY-397.
- Filtered decks have **no** rows here. They are evaluated live and never move cards.

**`deck_subscription`:** live sync (KEY-393).

| Column | Meaning |
|---|---|
| id TEXT PK | |
| deck_id TEXT NOT NULL FK → deck ON DELETE CASCADE | |
| source_kind TEXT NOT NULL CHECK in (`book_highlights`, `book_comments`, `sunnah_book`, `sunnah_bab`, `hadith_collection`, `poem`, `diwan`, `poet`, `list`, `lexicon`) | |
| source_ref TEXT NOT NULL | The Work, bab, poem, list and so on |
| note_type_id TEXT NOT NULL FK → card_note_type | The type used for generated notes |
| template_options TEXT NULL | A JSON object, validated, for example which hadith variant cards to make |
| new_items TEXT NOT NULL DEFAULT 'toast' CHECK in (`silent`, `toast`) | |
| last_synced_at TEXT NULL | |

### 3.5 `srs_preset`: deck options

| Column | Meaning |
|---|---|
| id TEXT PK | One built-in "Default" preset that can't be deleted |
| name TEXT NOT NULL | |
| learn_steps TEXT NOT NULL DEFAULT '[1,10]' | Minutes. A JSON array of numbers. |
| relearn_steps TEXT NOT NULL DEFAULT '[10]' | |
| new_per_day INTEGER NOT NULL DEFAULT 20 | |
| reviews_per_day INTEGER NOT NULL DEFAULT 200 | |
| desired_retention REAL NOT NULL DEFAULT 0.9 | CHECK between 0.7 and 0.99 |
| maximum_interval INTEGER NOT NULL DEFAULT 36500 | Days |
| bury_new, bury_reviews, bury_interday INTEGER NOT NULL DEFAULT 0 | Off by default, as in Anki |
| leech_threshold INTEGER NOT NULL DEFAULT 8 | |
| leech_action TEXT NOT NULL DEFAULT 'tag' CHECK in (`tag`, `suspend`) | |
| new_order TEXT NOT NULL DEFAULT 'position' CHECK in (`position`, `random`) | |
| fsrs_params TEXT NULL | Null means the ts-fsrs defaults; otherwise a JSON array of 21 numbers |
| anki_id INTEGER NULL | |
| anki_extra TEXT NULL | Anki options BagLib doesn't use (audio, timers, display order) |
| created_at, updated_at TEXT NOT NULL | |

These are real columns, not JSON, because the scheduler reads them on every queue build and they should be validated by the database.

### 3.6 Card states and history: Anki's mechanism

**States.** `srs_state.state` already holds `new`, `learning`, `review`, `relearning` and `suspended`. Two changes:
- **Every card in a deck gets a `srs_state` row**, starting as `new`. Today only cards added to memorization get one. The "memorize" toggle is replaced by deck membership plus suspend.
- New columns on `srs_state`:
  - `learning_step INTEGER NOT NULL DEFAULT 0`: ts-fsrs 5's step counter;
  - `buried_until TEXT NULL`: hidden until that time by sibling burying or a manual bury, and cleared at the next rollover;
  - `new_position INTEGER NULL`: the order new cards are introduced;
  - `desired_retention REAL NULL`: the value used at the last review, kept for Anki's `dr`.

  Plus `idx_srs_state_buried`.

**Daily queue.** This is KEY-389.
- New cards are taken up to the preset's `new_per_day`, in position order.
- Due cards are `learning`, `relearning` and `review` cards whose due time has arrived by the end of today, using the rollover hour, up to `reviews_per_day`.
- The counts show as **New / Learning / Due**, as in Anki.

**History.** `srs_review_log` is rebuilt, because SQLite can't relax a CHECK in place:

| Column | Meaning |
|---|---|
| id, knowledge_id, reviewed_at, duration_ms, state_before | Unchanged |
| rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 4) | 1–4 are Again/Hard/Good/Easy. **0 means no answer was given.** It's allowed only for `reset` and `rescheduled` entries, which a trigger enforces. |
| entry_kind TEXT NOT NULL DEFAULT 'review' CHECK in (`learn`, `review`, `relearn`, `filtered`, `reset`, `rescheduled`) | Anki `revlog.type` 0, 1, 2, 3, 4 (manual), 5. Anki's "manual" entries with an interval of 0 are **`reset`**: the card was sent back to new. Those with a set date are `rescheduled`. |
| interval INTEGER NULL | Anki `ivl`: positive = days, negative = seconds |
| last_interval INTEGER NULL | Anki `lastIvl` |
| factor INTEGER NULL | Anki `factor`: the SM-2 ease ×1000, or the FSRS difficulty |
| anki_id INTEGER NULL UNIQUE | Anki revlog id (milliseconds), so history is never duplicated on re-import |

**Statistics rule:** count only `entry_kind IN ('learn','review','relearn','filtered') AND rating >= 1`. Reset and rescheduled entries are history, not reviews. The four services above adopt the rule in the migration task.

**Importing the 30,342 rating-0 entries.**
- Entries whose card is imported are kept as `reset` history.
- Entries whose card no longer exists in Anki (about 28,500, from the 2024 bulk reset) go into an `anki_orphan_revlog` archive table, so re-export can still write them, but they never show in BagLib.

### 3.7 Day start (decided)

The `srs.rolloverHour` setting offers **4 AM (default)** or **midnight** in Settings. "Today", the daily limits, due counts, "reviewed today" and clearing burials all use it.

### 3.8 Shared cards (Claude's choice, as the user delegated it)

**Rule: shared until edited, and the user chooses the scope of each edit.**

**What "the same card" means (the user's clarification, 2026-11-17).** An ayah, hadith or poem is just **content inside a card's fields**, not the card itself. Sharing is decided by the **note**: the same note type with the same field values.
- **Different cards about the same ayah are separate cards**, each with its own schedule. Examples: one that explains its meaning, one that links it to a tafsir, one that tests a translation. Seeing several of them on the same day is expected and fine, so they are **not** buried against each other because they share a `source_ref`. Burying applies only to siblings of one note (3.6, and the preset's bury settings).
- **The same card** (the same note, the same fields) never appears twice in a day, even when it's in several decks. That is guaranteed because it is one card with one schedule.

1. Adding **the same note** (the same note type and the same fields) to another deck **adds the same card** (a `deck_card` row). There is one card, one schedule and one history, and reviewing it in any deck counts once. Making a card for the same ayah with **a different note type or different fields** creates a **new note**, with its own cards and schedule.
2. **Editing a card that is in more than one deck asks:**
   - **"Change in this deck only"** (the default): BagLib copies the note and its cards for this deck. The copy keeps `copied_from_note_id`, takes **a copy of the original's schedule** (state, stability, difficulty, due date) and starts its own history from that point. The original's history stays with the original and is reachable from the copy, so statistics never count a review twice. The copy replaces the original in this deck only.
   - **"Change everywhere"**: edits the shared note in place, for example to fix a typo in your own note.

   Editing a card that is in only one deck just edits it, with no question.
3. **Source text is editable by default** (3.11). Copies may differ in the text itself (an added word or ayah, a corrected narrator name, a bracketed comment) or around it (a hint, a note, the layout, the cloze). When the protection setting is on, source-text fields are read-only, and copies differ only around the text.
4. **Live sync** (KEY-393), when the source changes:
   - **Shared originals** update automatically, and their schedule and history are untouched.
   - **Copies are never overwritten.** The user deliberately made them different. BagLib sets `source_changed_at` and shows "The source changed. Update this copy?", with update or keep.
   - **Source-text fields the user edited are never overwritten,** in a copy or in a shared original. BagLib flags the note with "The source changed. Update this card?" and shows the user's version, the old source and the new source side by side. Fields the user didn't edit update automatically.
5. **Anki export** allows one deck per card, so a card in several decks is written once into each of its decks. Each export gets a GUID derived from the note GUID and the deck id, so re-import maps it back to the same shared card.

Rejected alternatives:
- **Always one deck per card**, Anki's way: the same card in two decks would become two copies with two schedules, so the identical card could come up twice in one day.
- **Editing always changes everywhere**: one edit for a lesson deck would silently change every other deck.

### 3.9 Migration 030 (one transaction, after the automatic backup in `migration-backup.ts`)
1. Create:
   - `card_note_type`, `card_note_field`, `card_note_template` and `card_note`;
   - `deck`, `deck_card` and `deck_subscription`;
   - `srs_preset` and `anki_orphan_revlog`.
2. Seed the built-in note types, with `source_text` flags on the Quran, hadith and poetry fields, and the Default preset.
3. Add the new `card_detail` and `srs_state` columns, and rebuild `srs_review_log` (all rows copied, existing rows set to `review`).
4. **Backfill notes.** Every existing card becomes a one-card note: Basic, or Multiple choice when `question_kind='choice'`. Its fields are `{Front, Back}`. Its GUID is the card's `knowledge.id`, so a KEY-235 text export still matches on re-import.
5. **Move decks.** `collection_type='deck'` rows become `deck` rows. `knowledge_collection` links to them become `deck_card` rows. Cards that are in several decks stay **shared**. Then the old deck rows and links are deleted.
6. Every card in a deck that has no `srs_state` gets one in state `new`.
7. **Down migration:** reverse the steps; rating-0 rows are kept in a backup table, never discarded.

### 3.10 Coverage
- **Backups** copy the whole database, so they are already covered.
- **Version history (ADR-008):** `card_note` edits are versioned as `entity_type='card_note'`.
- **Trash:**
  - A trashed card leaves `deck_card` until it's restored.
  - A note with no live cards appears in "Orphaned cards", and is never deleted automatically.
- **Data dictionary:** section 5 is rewritten once this ADR is approved.

### 3.11 Editing source text (the user's decision, 2026-11-17)
- **Setting `revision.protectSourceText`**: **off by default**, so the user can edit Quran, hadith and poetry text in cards. Turned on, every `source_text` field becomes read-only.
- **Why it is editable by default.** Datasets aren't always right or complete. The user may want to:
  - add a related ayah, or two words of the next ayah, to the front;
  - fix missing or wrong data in a hadith, such as a narrator's name in the isnad;
  - add a comment in brackets.
- **Safeguards, whichever setting is on:**
  - `source_snapshot_json` keeps the original;
  - edited source-text fields show an "edited by you" marker, with **Compare** and **Restore original**;
  - version history records every edit (ADR-008);
  - live sync never overwrites an edited field (3.8).
- **This changes today's behaviour:** `KnowledgeCardRepository.update` currently refuses edits to Quran, hadith and poetry cards. That refusal will apply only while protection is on.
- **Future follow-up (KEY-406).** Later, the user decides whether to keep both modes or only one. Some built-in content may need to be locked.

### 3.12 Card media (the user's decision, 2026-11-17, KEY-391)
- **Where images live.** Card images (image occlusion, and later imported Anki media) are files in a `card-media/` folder next to `baglib.db`, one file per image. **There is no database table.**
- **Names.** Each file is named by the SHA-1 of its bytes plus its real type (`<sha1>.png|jpg|gif|webp|bmp`), so the same image is stored once. The type comes from the file's first bytes, never from its name. Notes reference a file the way Anki does: `<img src="<sha1>.png">` in a field.
- **Rendering.** The card frame's CSP allows only `data:` images, so the renderer swaps each card-media name for a `data:` URL from main. The renderer never passes a file path to main: it asks main to open the file dialog, or sends dropped or pasted bytes, which main checks.
- **Backups.** Snapshots carry `card-media/<name>` entries. Restore writes back only entries whose bytes match their hash, after the database passes its integrity check, and never deletes or overwrites files.
- **Anki.** This mirrors `collection.media`, so `.apkg` import and export (KEY-392) map one to one. Until then, the text export writes image occlusion notes to their own file plus a media folder to copy into Anki's `collection.media`.
- **Stock Image Occlusion note type** (migration 033): Anki's fields (Occlusion, Image, Header, Back Extra, Comments) and templates, with shapes stored as Anki's `{{cN::image-occlusion:…}}` cloze text.

## 4. Consequences
- **KEY-389:**
  - **New / Learning / Due** queues, with limits;
  - learning steps;
  - burying, from `note_id` and `buried_until`;
  - leeches;
  - filtered decks, from `deck.kind`;
  - the rollover setting.
- **KEY-390:** every note type, using real field and template tables, with `source_text` fields editable by default and read-only when the protection setting is on.
- **KEY-392:** a lossless converter, because every Anki item has a home, including history for deleted cards.
- **KEY-393:** `deck_subscription` plus per-note `source_hash`, `source_changed_at` and `orphaned_at`.
- **KEY-235's deck code moves** from `collection` to `deck`. This is a deliberate restructure, possible because the app hasn't shipped.
- **Cost:**
  - 9 new tables: the note type, field, template and note tables; `deck`, `deck_card` and `deck_subscription`; `srs_preset`; and `anki_orphan_revlog`;
  - new columns on `card_detail` and `srs_state`;
  - a rebuild of `srs_review_log`;
  - the decks moved out of `collection`;
  - statistics queries updated.
- **Risk:** the rebuild of `srs_review_log` and the deck move touch existing data. Both run in one transaction after the pre-migration backup, and are tested on a copy of a database with real cards and reviews.

## 5. Notes from other user decisions (2026-11-17)
- **Answer grading is on hold (KEY-394).** Nothing is added for it here; `practice_attempt` (ADR-013) is ready for when it resumes. Type-in cards show a diff, and the learner grades.
- **Quran wird and muraja'a (KEY-286)** stay outside this model, and aren't Anki cards. Their placement is a future decision (KEY-405).

## 6. Approval
**Approved by the user on 2026-11-17** ("Approve ADR-017"), as written in revision 2 with sections 3.8 and 3.11.
- `docs/data-dictionary.md` section 5.4 records the approved model.
- KEY-389, KEY-390, KEY-392 and KEY-393 are unblocked.
- Follow-up decision KEY-406 stays open.
