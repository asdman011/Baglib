# Feature: Quran Khatmah

## Implemented scope — 2026-10-26, Codex

The Quran section includes a **Khatmahs** tab alongside Read and Resource Library. Multiple independent private plans (up to 20) use installed script/layout pairs. A dashboard card displays today's earliest unread pages, accessible completion bar, consecutive civil-day streak, target date and pace-based forecast. Users can jump directly to the exact first assigned Mushaf page, explicitly confirm today's target, mark/undo an individual page in the reader, edit scheduling, pause/resume or delete a plan.

Presets are 7, 15, 30, 60, 180 and 365 **days**, not variable-length calendar months. Custom days, a completion date, pages per session × daily sessions, and whole Juz per day are supported. Pages/session can represent prayer-adjacent reading without claiming to compute prayer times. Duration/date quotas recalculate over remaining days; fixed page/Juz pacing stays fixed when behind schedule. Partial/gapped reading is preserved and never double-counted. Pausing preserves history and the original deadline; users can edit that deadline on resuming.

The interface uses the existing Arabic/English translation dictionary, logical layout properties, source titles and theme tokens. It does not introduce another Quran reading mode or change source text. The compact reader-side control only affects the selected matching plan, not all concurrent plans.

## Architecture and privacy

- Contracts: `src/shared/types/khatmah.ts`; pure civil-date calculations, assignments, statistics and cancellable 20-second dwell helper: `src/shared/khatmah.ts`.
- `src/main/services/quran/khatmah.ts` validates writes and stores one versioned value, `quran.khatmah.v1`, using the existing `app_settings` SQLite key/value repository. No SQL migration, canonical corpus mutation, library entity/column or dependency is introduced. This implements the approved private user-state separation without creating new Quran database entities.
- Guarded `quran:khatmah-list` / `quran:khatmah-mutate` IPC reuses the trusted main-frame guard in `src/main/ipc/quran.ts`. Source binding is resolved in the main process, not accepted as renderer-provided metadata. Progress survives reload/restart and remains separate between plans.
- Each plan retains immutable installed script/layout pack IDs and its profile/pagination mode. Changing reading/layout does not silently transfer progress. Removing its packs preserves progress but prevents direct navigation until those exact bindings are restored; a newly imported replacement may have a different pack ID and require a new plan. Automatic rebinding/migration is not implemented.
- Corrupt settings/history fail closed with a storage error rather than being overwritten. Read pages are unique, bounded 1–604 and dated by the local civil date, not UTC midnight. Calendar arithmetic avoids DST-length day assumptions.

## Juz coverage and Warsh boundaries

`KHATMAH_JUZ_STARTS` and `KHATMAH_JUZ_ENDS` are the 30 source ayah boundaries from supplied QUL metadata 68. During Hafs plan creation, both boundaries are mapped through the selected installed layout by the existing Quran reader worker. No equal `604 / 30` partition or guessed page table is used for assignments. Whole pages covering each Juz are assigned, including a shared boundary page if its final ayah is there. Reading that whole page also covers its beginning of the next Juz. This is page-level progress, not an ayah-by-ayah certification.

Warsh date/page plans use the existing explicitly **adapted** 604-page layout. This is not a printed Warsh facsimile. Juz pacing is unavailable for Warsh because a verified Warsh-specific division mapping was not supplied; Hafs numbering is not transferred. See [QUL investigation](QUL.md) and [resource contracts](Quran%20Resource%20Contracts.md).

## Automatic marking

Manual confirmation is the default. Opt-in automatic marking requires the matching reader page to remain intersecting/visible for 20 uninterrupted seconds with the document visible, window focused and reader tab active. Focus loss, visibility loss, page/source changes, plan changes and unmount cancel the timer. Only the selected plan is changed; duplicate page visits do not create additional progress/streak entries. This is an activity estimate, not proof the user read every word, and can be undone.

## Reminders and lifecycle

Optional Electron system notifications use a user-selected fixed local time and saved language. The scheduler starts only after successful library database initialization, checks every 30 seconds and on resume, skips future/paused/completed/daily-finished plans, and persists per-plan/day deduplication after Electron's `show` event. Failed notification events do not mark the reminder delivered. Pending notifications/timeouts/listeners are disposed at shutdown. Windows uses the existing builder AppUserModelId `com.Baglib.app`.

**Baglib must be running.** There is no OS scheduled task, autostart service, external push server, cloud account or calculated Fajr time. Windows permissions/Focus Assist can suppress visible notifications even after the OS accepts them. Clicking a notification focuses Baglib; it does not currently deep-link to a particular plan. Reminder support detection is not proof of OS delivery.

## Verification

Pure and SQLite-backed tests cover duration presets completing all 604 unique pages, leap/DST-safe dates, invalid inputs, fixed/adaptive pacing, future/paused plans, shared Juz boundary coverage, gaps, forecasts, streaks, independent persisted plans, idempotency, undo, source mismatch, reminder deduplication and corrupt-state preservation. Deterministic dwell tests verify the actual 20,000ms delay, cancellation and single marking. Bilingual SSR checks verify accessible controls and manual defaults.

Native fixture `scripts/quran-reader-live/khatmah.ts` exercises trusted IPC with actual installed Hafs sources, resolves all 30 Juz mappings, opens page 2 from today's assignment, marks/undoes without changing another plan, reloads persisted state, rejects a mismatched layout, and checks dashboard/form geometry in Arabic RTL / English LTR at 480 and 1280 widths. Native notification banners and human reading comprehension are not certified by these tests. Final run identifiers/results are recorded in the handoff files.

Final verification: **913 full / 17 focused tests passed**, clean typecheck/main build/focused lint (existing Next pages-directory advisory), and native `run-8UoU7K` with zero renderer errors. Arabic/English dark/light captures were visually inspected. A physical SQLite close/reopen test preserves plan IDs, source bindings, history and reminder deduplication. `git diff --check` passed; no Git/Jira action was authorized or performed.

No collaborative/group syncing, reminder service while closed, fractional Juz schedules, printed Warsh pagination or cross-layout progress migration is claimed.
