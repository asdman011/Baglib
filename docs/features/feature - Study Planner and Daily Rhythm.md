# Study planner, progress tracker and daily rhythm

Wave 3, KEY-221 / KEY-236–239. Implemented in the working tree on 2026-11-01 by Codex; not committed/pushed and not marked Done in Jira. Ticket descriptions were read in full. No external reference application was reverse engineered for this implementation.

## Planner — KEY-236

Approved ADR-007 and migration 020 add a separate twelve-column study_task table, not a new Work or knowledge subtype. A navigation entry opens a source-linked to-do editor with completion/reopen/cancel, priority, explicit ordering and deletion confirmation. Reuses StudyLinkPicker for book/note/Quran/hadith links; surah scope routes to the first ayah while retaining the reading profile. Missing/uninstalled sources fail without erasing the saved task. Linked book deletion leaves task data and label snapshots intact.

Week/month/year views use Gregorian or the existing adjusted Umm al-Qura Hijri conversion. Actual Hijri month/year boundaries are computed with bounded scans of that existing conversion; months are not assumed to have 30 days. Civil dates are stored only once. Date-entry fields remain explicitly Gregorian; selecting a day in either rendered calendar schedules that civil date. Saturday is the current week-start policy. Unscheduled tasks stay in the to-do list. This version loads at most 5,000 tasks, with a visible limit notice.

Optimistic edits/deletes compare updated_at so a stale window cannot overwrite a newer task. Source text is never rewritten. Existing source-selection and note navigation patterns are preserved.

## Subject hours and order — KEY-237

StudyInsightsService reads valid completed reading_session intervals joined to the Work's primary category. It rounds elapsed seconds once per session. If no such sessions exist, it explicitly labels a fallback to reading_page_stat durations/reading_book_stat subjects. It never adds the two stores together. Multi-category Works are assigned only their primary category, avoiding duplicate time. Aggregation is bounded to 100,000 newest valid time records; truncation is labeled.

Suggestions place Quran-linked open tasks first, then priority/manual order. A saved explicit user order overrides that suggestion, including moving another task above Quran. Preferences use an existing app_settings row; no new schema is required. Revision/research hours without a recording source are shown as unavailable, not fabricated.

## Goals and insights — KEY-238

Existing settings hold optional minute/page goals (zero disables). Daily progress and seven-day summaries use the stated recorded time source. Dwell fallback pages are visits, not unique pages. Session averages are unavailable when only dwell records exist. Saved knowledge item counts, stored questions, recent study-note reflections, latest knowledge updates and planner completion counts are displayed with definitions; none is represented as an understanding score, complete edit audit or research-quality judgment.

Word frequencies are computed on demand for one book or all indexed text. Only book_content_fts content is read; normalization is derived and keeps ة/ه distinct. Original content and normalized_content are untouched. Queries yield between small batches, cap at 2 million input characters / 5,000 indexed records, skip cut-off partial word tokens, return at most 50 forms and disclose partial results. This does not imply that every library book has been indexed or OCR'd.

## Pauses and intention — KEY-239

Both snooze and launch reminder default off. Users may enable prayer pauses, choose a duration, and set optional zikr/wird clock times in the Athan timezone. Prayer windows reuse evaluatePrayerScheduleStatus, excluding sunrise. Custom windows span midnight with a stable prior-day identity. A running prayer window is retained through midnight until its original end; a launch occurring after midnight cannot reconstruct a previous day's unprovided prayer timetable. Schedule changes reset the retained window.

A top-layer modal leaves the underlying document/view mounted, supports skip/Escape and disable controls, and flushes then pauses the reading tracker. Resuming resets its time origin, excluding snooze time without dropping the active page/session. The same signal pauses TTS/audiobooks, Quran audio and auto-scroll. Audio and auto-scroll resume manually, not automatically. The dialog handles its own focus through the native modal mechanism.

The user supplied and approved these exact words: `طلاب عمل لا طلاب علم` / `Seekers of doing, not knowing`. Central translations provide the default editable text. No book quotation or scholarly attribution is invented. The launch toggle remains off until enabled by the user; both language fields must be present before saving an enabled reminder.

## Verification and limits

- Planner tests: schema count, persistence after database reopen, conflict rejection, complete/reopen, linked-book deletion, invalid dates/references and real adjusted Hijri/Gregorian boundaries.
- Insights tests: exact subject-hour fixture, no session/dwell double-counting, unavailable measurements, saved goal/order preferences, Quran-first suggestion with explicit override, read-only normalized word counts and partial caps.
- Rhythm tests: defaults/validation, prayer start/end boundaries, no sunrise pause, custom midnight window identity and tracker pause/resume with excluded idle time.
- scripts/planner-live runs the actual compiled main/preload and dev UI using BAGLIB_DATA_DIR and --user-data-dir pointing at a newly created disposable profile, not the user's library. It exercises form saves, completion, reload persistence, six calendar combinations, 480/1200 width containment, fixture summaries/goals/frequencies, actual snooze override and the approved bilingual launch text. Run only against a dedicated server and stop that server afterward.

No production installer test, physical device sleep/timezone-change test, live audible TTS/Quran-media playback test during snooze, or real installed Quran/hadith source-navigation audit was performed. Core reading_session rows still cascade on Work deletion as before; changing that history policy requires separate approval. The untouched knowledge-preservation migration continues to protect knowledge and review history. Final command results and artifact paths are recorded in CURRENT_TASK.md.

Final checks: 1,223/1,223 tests pass with concurrency capped at four, tsc and main build pass, changed-file lint has no errors (64 existing reader warnings), and the focused refined/new-file lint has no warnings. Native results: `.baglib-data/planner-live-roSh4I/results.json`; inspected screenshots from `planner-live-ICzt3A`. A final month-leading-cell alignment refinement was not recaptured natively. Next typegen regenerated a malformed development route-types artifact after stopping the server. No production renderer build was run during a live dev server. Port 3000 was free after cleanup. Tickets KEY-221/236–239 are In Progress; completion still requires the user's authorized commit and successful push, plus honest treatment of the stated acceptance limits.
