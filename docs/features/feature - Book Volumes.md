# Feature: Book Volumes

## Scope — Codex, 2026-10-26

Book Details now exposes a **Book volumes** panel with a shared multi-volume set title, this volume's number/label and optional total count. Enter the same explicit set title and author for existing volumes to link them. The panel lists those local volumes in numeric order, supports direct switching with unsaved-change confirmation, and offers **Add a volume to this set** after the current record is saved. Library cards and rows display a small volume/total badge so identical titles remain distinguishable. Arabic and English labels come from the centralized translations dictionary; layout uses logical properties.

## Existing approved boundary

`BookSpecificMetadata` already declares `volumeNumber`, `totalVolumes` and `seriesTitle` in `src/shared/types/metadata.ts`. `BookItem`/`BookItemInput` and `SqliteWorkRepository` now carry those existing metadata fields through add/get/list/update using the established work `metadata_json` extension. There is **no new database table, SQL column, entity, relationship, dependency or migration**. Work → Edition → Source is unchanged: a separately readable volume retains its own existing Work/Edition/Source records. A volume is not stored as an alternative edition of another volume, and no new persistent set/container entity is claimed.

The current set is a derived UI grouping based on explicit normalized set title and author, restricted to books with a volume label. Normalization trims/collapses whitespace and canonical Unicode composition for comparison; original stored titles, Arabic text and labels are preserved. There is no guessed grouping from similar titles, cover art or shared filenames. Different authors never merge automatically. This lightweight grouping is not a globally unique set ID: same-author same-named sets with multiple editions can appear together. A future durable set identity/cross-edition hierarchy needs an explicitly approved model change.

## Safe draft and persistence behavior

`src/shared/book-volumes.ts` validates bounded totals (1–10000), handles Arabic/Persian/Latin numeric labels for sorting and comparison, and rejects a numeric volume larger than its known total. Other short labels such as Roman numerals are preserved and collated as labels, not interpreted as exact cardinal positions.

A new draft selects the first unused numeric slot. It copies only relevant shared bibliography/classification. It does **not** clone file path/hash, cover, ISBN, reading progress, annotations, loan history or provenance. Users attach that volume's own file/cover and save normally. The add action is disabled when unsaved, incompletely grouped or the declared numeric range is full. Manual edits of the set title do not rewrite other records in bulk.

The repository validates this metadata atomically and supports explicitly clearing an optional total. Existing records without set metadata are unchanged. Switching volumes also guards asynchronous initial EPUB cover assignment from landing on a different record. Exact sources/progress and existing notes remain independent.

## Other requested detail control

The footer **Geek details** button is now a compact 28px icon-only control, retaining its translated tooltip, accessible name and existing diagnostics action. The already compact contextual control is unchanged.

## Verification and limits

- Repository tests verify independent persisted records, get/list/update round trips, clearing totals, invalid-value rollback and unchanged SQLite table definitions.
- Shared tests verify explicit grouping, author separation, Arabic/Persian number handling, ordering, consistent totals and safe draft creation.
- Arabic/English rendering tests verify translated controls, navigation and volume badges.
- `scripts/book-details-live/run.mjs` exercises real Electron preload IPC and SQLite-backed library operations, cross-volume navigation, safe third-volume creation/save, unchanged first-volume progress, compact button geometry, Arabic RTL/English LTR widths and theme captures. It also checks controlled LibGen cover loading/failure and JSON-unavailable fallback.

This is explicit local multi-volume management, not automatic volume detection from filenames, cloud set syncing, one-file splitting or cross-volume annotation migration. LibGen's observed provider-side JSON failure and pre-existing lint debt are reported separately; no claim of universal upstream cover availability is made.

Final results: **925 full tests pass**, clean typecheck/main build/diff checks; native `run-wLZOK4` passes with zero renderer errors. Arabic dark and English light volume screenshots were visually inspected. The five modified legacy source files have the same 134 ESLint errors as HEAD, not introduced by this task; one warning was removed. New source files have no lint errors, with the expected Next `<img>` optimization advisory for the Electron-compatible thumbnail. No commit/push/Jira action was authorized or performed.
