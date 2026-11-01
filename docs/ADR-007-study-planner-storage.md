# ADR-007: Study Planner Storage

## Status

Accepted for KEY-236 on 2026-11-01: the user responded `continue` to the explicit approval request for this design. Approval covers the one table, twelve fields, two indexes and reference/date policies below, not future schema/dependency/Git changes. Prepared for KEY-236 under KEY-221 after reading all four Wave 3 tickets. Follows ADR-006's context/options/decision/consequences structure.

## Context and verified existing behavior

- KEY-236 requires persistent dated tasks, book/note/surah/hadith links, week/month/year calendars in Gregorian and Hijri, and a navigation entry.
- `src/shared/study-notes.ts` validates source-scoped book, note, Quran and Sunnah targets. Quran targets include Hafs/Warsh identity; a surah task can refer to its first ayah and retain an explicit surah-scope marker in its reference metadata.
- The application has `app_settings` and `knowledge` with subtype tables. A scheduling task is not itself scholarly knowledge or a library Work. No planner table was found in the migration registry inspected.
- `reading_session` in migration 001 has work/edition identity, start/end timestamps and pages. Separately, migration 014's reading_book_stat/reading_page_stat store subject metadata and page-dwell time through `reading-tracker.service.ts`. These are not interchangeable and must not be added together without an identity/coverage policy.
- Existing Hijri conversion is `calculateHijriDate` in `src/shared/athan-calculator.ts`, using Umm al-Qura with the existing day adjustment and fallback. Reuse it rather than introducing a second conversion library.
- Migration 019 preserves knowledge/annotations on Work deletion. Planner rows must likewise never cascade with a linked book. Existing reading_session cascading remains a known separate issue, not permission to alter that table here.
- Migrations 018 and 019 are present and uncommitted work from another session. The next candidate is 020, not reserved; re-read Git status and the migration registry before any approved migration.

## Options

| Option | Advantages | Drawbacks |
| --- | --- | --- |
| A. One dedicated study_task table | Indexed calendar queries, atomic edits, independent task lifecycle, no changes to library or knowledge entities | Requires the user's approval of one new table and its columns |
| B. JSON tasks in app_settings | No migration | Whole-list writes, poor date indexing and avoidable concurrency/scaling costs; should not be used to evade the user's approval gate |
| C. A knowledge subtype plus task detail | Shares knowledge infrastructure | Makes ordinary tasks into knowledge, expands type assumptions, and overlaps active knowledge-card work |

## Approved decision: Option A, KEY-236

Add one table with exactly these twelve columns after approval:

| Column | Type / constraints | Meaning |
| --- | --- | --- |
| id | TEXT PRIMARY KEY | Stable generated task identity |
| title | TEXT NOT NULL | User's original title; trimmed/nonblank validation |
| description | TEXT NOT NULL DEFAULT '' | User's original details, not normalized in place |
| status | TEXT NOT NULL, open/completed/cancelled, default open | Explicit lifecycle, enforced with CHECK |
| start_date | TEXT NULL | Gregorian local civil date YYYY-MM-DD; no UTC day shift |
| due_date | TEXT NULL | Inclusive end/due date, or same-day task when start_date is absent |
| priority | INTEGER NOT NULL DEFAULT 0, range 0–3 | User-selected priority, not an automated religious judgment |
| sort_order | INTEGER NOT NULL DEFAULT 0 | Stable user-controlled order within a list |
| references_json | TEXT NOT NULL DEFAULT '[]' | Validated bounded array of existing source targets with saved labels and optional scope |
| completed_at | TEXT NULL | UTC ISO timestamp of completion; cleared on reopening |
| created_at | TEXT NOT NULL | UTC ISO creation timestamp |
| updated_at | TEXT NOT NULL | UTC ISO last-edit timestamp |

Proposed indexes:

- `idx_study_task_due(status, due_date)`.
- `idx_study_task_start(status, start_date)`.

No new fields on existing tables and no new foreign keys. Task references are validated links, not ownership relationships. Deleting a book leaves the task, label and original reference intact; an unavailable source is shown honestly rather than removing the task. No cascading deletion or canonical corpus mutation.

Rules:

- Both dates empty means an unscheduled task, still shown in the to-do list.
- With only start_date or due_date, render on that date. With both, render its inclusive range; reject end before start and invalid civil dates.
- All dates are all-day values in this first scope; timed events, recurrence and remote calendar sync are not silently added.
- Gregorian/Hijri are projections of one stored civil date, not duplicate bilingual/calendar fields. Hijri month/year views must use the actual selected calendar boundaries and existing day adjustment, not a relabeled Gregorian grid.
- Bounded inverse Hijri date lookup can reuse the same existing conversion function; validate roundtrips, month/year boundaries and adjustment changes. Do not assume every Hijri month is 30 days.
- UTC timestamps describe actions; local calendar dates describe scheduling. Do not use `toISOString().slice(0, 10)` to derive a user's selected local date.
- Validate source targets through existing study-reference patterns. Retain Quran reading profile and hadith source identity. Do not fabricate book Works for sacred corpora.
- References contain pointers and user-facing label snapshots, not rewritten Quran/hadith/poetry text. A surah link uses a valid Quran target plus explicit scope, not an invented incompatible target syntax.
- Apply JSON/date/size bounds at the IPC/repository boundary. Completing/reopening and reordering are transactional; concurrent edits must not silently overwrite stale data.
- New strings use centralized ar/en i18n. Preserve user-authored text and use derived normalization only for search.

## Sequence after approval

1. Confirm no competing session is editing planner/integration files; recheck status and migration numbering. Implement KEY-236 persistence/contracts, validated IPC, planner navigation and week/month/year calendar using existing libraries. Verify reopen persistence and actual Hijri boundaries in RTL/LTR.
2. KEY-237 follows the planner. Audit reading_session versus dwell records and define a non-double-counting measured-hours policy. Use existing subjects where available; revising/research activity with no measurements must have an honest empty state. Suggest Quran first by default but always preserve a user override. Any required new subject/activity table or field needs a separate proposal and approval.
3. KEY-238 builds real-data goals/growth/statistics on existing knowledge, notes and statistics sources. Derive word frequencies without changing canonical text. Label unavailable edit/history/research measurements as unavailable rather than generating counts. Any newly required storage requires separate approval.
4. KEY-239 reuses Athan times and existing settings for opt-in prayer/zikr/wird windows, skip/disable overrides and progress-safe pause/resume. Flush reading progress before pausing; never navigate away or destroy an open document to enforce snooze. Track only actual foreground reading, not the paused interval. The optional launch reminder stays off until the user supplies or approves its wording; no attributed quotation is invented.

## Scope of approval

The user's continuation approves Option A's one table, twelve fields and two indexes, plus the described reference/date policies. Migration 020 implements that approved shape. No new package, download, schema alteration for later tickets, core model change or Git operation is included. Later goals/order/rhythm preferences reuse existing app_settings rows; they add no table or column. Neither reading_session nor knowledge preservation is altered.

## Verification plan (not yet executed)

- Repository tests: validation, transactional CRUD/reorder, date range queries, complete/reopen state, persistence after restart and references surviving Work deletion.
- Calendar tests: Gregorian/Hijri week/month/year boundaries, existing adjustment, leap days, local date stability, RTL/LTR and mixed-script labels.
- Subject/statistics tests: known sessions, no duplicate time, idle/snooze exclusions, explicit unavailable-data states, Quran-first suggestion and saved user ordering.
- Snooze tests: timing boundaries, deduplication, user skip/disable, preserved document/page/progress and optional launch reminder off by default.
- tsc, lint on changed files and npm test after implementation.
- Real app with disposable BAGLIB_DATA_DIR and --user-data-dir in both languages; never use the user's library. No build:renderer while a server runs. Stop only processes started for this work and confirm port 3000 free afterward.

## Implementation checkpoint

After continuation, the other session's knowledge-card work was committed and no repository test/dev process was found before edits. Migration 020, repository, guarded IPC and source-linked planner are implemented. Seven planner tests pass, including exact column count, database reopen, optimistic conflicts, source preservation and Gregorian/Hijri boundaries. Separate insights and rhythm tests cover the later tickets without another schema change. Real app checks on throwaway profiles pass in Arabic and English. Full validation and remaining limits are recorded in CURRENT_TASK.md and the Wave 3 feature document; no commit or push authorization has been inferred.
