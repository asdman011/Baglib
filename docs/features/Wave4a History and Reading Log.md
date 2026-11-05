# Wave4a: history, reading logs and question capture

## Scope

2026-11-02 implementation of approved ADR008 and KEY-240/241/242/246, following KEY-234. No editor/canvas/import dependency was installed. Wave4b and4c remain separate approvals/prototypes. Work→Edition→Source stays intact; sacred source text is not changed. This is inspection/integration of Baglib's own source, not reverse engineering of another application.

## Ownership and write boundaries

knowledge plus its detail is authoritative; annotations is a reader-compatible projection. `withKnowledgeHistory` wraps synchronous mutations in a database transaction and collects nested IDs once. It captures full before/after snapshots, skips semantic no-ops, preserves a baseline for pre-existing records, and records a batch ID. Existing legacy note IPC, knowledge saves, annotation/AI research saves, poetry knowledge, PDF reviews, tag rename/merge/delete, comments and Work detachment use this boundary. No annotation-first legacy save or swallowed projection failure remains. Direct ad-hoc SQL is not a supported application mutation path.

`study_note` and `reading_reflection` reads/saves are explicit. Book-compatible study notes use note-type projections; standalone notes/reflections do not receive accidental reader annotations. `useStudyNotes` prefers loaded knowledge over stale workspace note copies. Default lists/counts and SRS exclude trashed knowledge. Cards retain their schedules when trashed/restored.

## History UX and retention

Notes and preserved knowledge expose history/comments. Two-column comparison supports direction-auto text, localized dates, full metadata details and responsive stacking. Restore checks the expected head and appends a version; undo/redo select historical versions without removing newer history. History pages are bounded to200 with an older-page control. Missing/renamed tags and collections block restore until the user explicitly agrees to skip missing references/use surviving names; global associations are never silently recreated. Source deletion is reconciled when restoring old snapshots.

History remains until explicit erasure, with version/byte usage disclosure. Ordinary trash removes its reader projection, not its content/history. Permanent erase requires explicit consent to delete all managed local library backups, then removes live/projection/legacy/draft records, owned question captures, versions and blobs not referenced elsewhere. Independently copied material and external/cloud backups cannot be guaranteed erased; this is not a forensic SSD-erasure promise.

## Conversion and startup

Migration021 contains the approved new tables/fields/indexes and session-preservation rebuild. Before applying pending migrations to an existing file, `migration-backup.ts` holds exclusive ownership, checkpoints WAL, copies to a unique temporary file with bounded-memory hashing, checks SQLite integrity and publishes a protected plain backup. A failure exits before window creation with a bilingual native error; the ZIP snapshot service is not used.

Legacy conversion follows structural migrations, one resumable transaction per note. Raw original JSON is retained at least one release and included in history snapshots. Malformed/conflicting records are set aside and shown in a recovery report, never allowed to abort conversion of other notes. Missing Work references become null; free-text tags become exact named tag rows. IDs, aliases and original timestamps/content are retained. Conversion markers prevent duplicate re-import. No historical versions or missing book titles are fabricated.

## Reading and questions

The book detail modal and Notes book selector expose reading logs, source-labelled session/dwell totals, first/last known reading, measured speed, progress/location, observed completion, last reading streak and skipped days. Completed sessions take precedence; dwell is a fallback, not an additional total. Completion is stamped only on future observed transitions; old completed books display unknown completion date. Bounded measurement lists disclose partial results. Manual reflections support date, mood, difficulty, rating, review, recommendations and lessons. Actions create existing planner tasks with note references; quotes use quote_detail, not JSON fields.

Question capture is disabled by default and scans authored plain note/reflection text/comments for both question marks, excluding code, recognized quotations/URLs/embeds and source poetry text. Exact per-source hashes deduplicate repeated text while preserving answered/dismissed status. Source links and changed/unavailable-source notices remain. Detection is heuristic; ambiguous prose is not presented as linguistic certainty.

## Verification evidence

- Unit/service coverage includes transactional rollback, all primary note/projection routes, PDF reply/status anchors, poetry history, subtype DTOs, orphan/malformed conversion, preserved-type content, detached-session totals, association restore consent, question exclusions/dedup, trash/SRS, backup verification/concurrent-writer rejection, pagination and shared-blob erasure.
- Closed-app real-library copy: source SHA256 F9F32DD1F82414855B8EC201E64453BEC874888088FB00EFBF09E028D9333111 was unchanged during copy. Copy migration17→21 retained79 works,14 knowledge records,23 annotations and215 sessions; integrity ok and0 FK violations. No original library was opened by the migration test. Copy verification in `.baglib-data/wave4-real-copy-62a8768a66164ff2922a938eb634dd7e/verification.json`.
- Actual Electron main/preload/dev renderer: `.baglib-data/wave4-live-j0sfFc/results.json` verifies ar/en history compare/restore, question answering, reflection form, planner action, exact quote, trash and consent-gated erase at480/1280 widths. Arabic/English screenshots were visually inspected. An earlier test selected a history-comment textarea rather than the reflection form; the selector was corrected and the run repeated successfully.
- Actual app on a second disposable real-data copy: `.baglib-data/wave4-live-LHfXXr/real-copy-results.json` verifies79 books, integrity and knowledge loading in both languages.
- Check CURRENT_TASK for final full-suite/type/lint/build results. No production installer, forced power-loss, physical timezone switch, forensic deletion or extreme-scale performance claim is made. Native error-dialog failure handling is implemented and backup rejection is service-tested, not physically clicked through in the live harness.
