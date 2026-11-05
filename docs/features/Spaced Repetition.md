# Built-in spaced repetition

## KEY-234 implementation — 2026-11-02

Uses the already approved and installed `ts-fsrs` 5.3.1 and migration018 tables. No new schema or dependency. Scheduling runs in the main process; the renderer receives bounded queue DTOs and submits a rating with the expected schedule revision. Changes to state and review history commit atomically. Stale, suspended and not-yet-due reviews are rejected.

`src/main/services/srs.ts` converts persisted scheduling state to FSRS cards. Full before/after FSRS cards are serialized into the existing `srs_review_log.state_before` text column as a versioned envelope, preserving learning steps and scheduled intervals across restart without adding fields. Existing non-envelope history is tolerated. The schedule columns remain the current state; the envelope supplies the additional FSRS fields. Fuzz is disabled for deterministic schedules. Resume restores the prior learning/relearning mode where the envelope exists; legacy reviews use the existing fallback.

The Notes screen contains reveal-before-rating controls (Again/Hard/Good/Easy), due count, today's review count and next due time. Empty queues refresh when the next card becomes due. Cards created from notes copy exact title/content into a separately saved note-source card and explicitly enable memorization. Content exceeding the existing card limits is rejected rather than truncated. The dashboard links review counts to Notes. Suspending a card preserves its progress.

## Scope and compatibility

- Review queues contain at most 50 cards; the count includes all due cards.
- Daily counts use the device's local calendar day; review timestamps are UTC ISO strings.
- New review IPC accepts only trusted top-level application frames.
- Card deletion currently follows existing hard-delete behavior. Wave4a trash/erase integration remains pending; the scheduler already excludes trashed knowledge if the approved deleted_at column is present.
- Work deletion preserves cards/reviews under migration019. Restoring a note must not reset the scheduler.
- This is own-source integration, not reverse engineering of an external application. No external engine runtime investigation is claimed.

## Verification

Service tests cover ratings, stale submissions, suspend/resume, restart persistence, transactional failure, book deletion, queue bounds, validation and daily rollover. `scripts/srs-live/run.mjs` launches the actual Electron main/preload against the development renderer with disposable BAGLIB_DATA_DIR and --user-data-dir. It exercises Arabic/English reveal/grading/reload and note-to-card creation. Check CURRENT_TASK for actual run results and limits; scripts existing on disk alone are not evidence of successful execution.
