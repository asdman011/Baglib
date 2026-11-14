# ADR-016 — Manuscript storage, derived search and checkpoint history

## Status

Accepted under the user's 2026-11-14 approval of R3 in Research Editor Plan revision 2.1, KEY-364 under epic KEY-361. R6 retains study boards in BoardStore JSON, with the pre-release decision tracked by KEY-376. Migration 029 implements the approved manuscript tables. Verification results are recorded in the KEY-364 handoff and local agent report.

## Decision

A manuscript is an independently authored research project or book. It has exactly id, title, kind (research/book), settings_json (default {}), created_at, updated_at and nullable deleted_at. Canonical titles retain the user's script and spelling. This adds no relationship to Work → Edition → Source.

manuscript_document has exactly id (the BlockSuite document id), manuscript_id, nullable parent_id, title, position, snapshot, plain_text (default empty), primary_mode (page/edgeless, default page), updated_at and nullable deleted_at. Both foreign keys cascade on physical deletion. parent_id and sibling position represent Part → Chapter → Section without another entity or persisted document-kind field. Main rejects cycles, foreign-manuscript parents, invalid positions and moves into hidden ancestors. Moves reorder both affected sibling sets transactionally, retaining trashed siblings in the sequence.

snapshot is the original serialized BlockSuite DocSnapshot JSON. Newly created documents include a valid BlockSuite DocSnapshot envelope, metadata and page/surface/note/paragraph starter tree, and rename preserves the envelope while updating meta.title. Saving preserves that string byte for byte. Pure shared functions derive plain_text, the page title when present, and manuscript_link references. Renaming updates the page title block as well as the document title. Unknown block properties remain in the snapshot. The derivation understands serialized delta text, nested block children, footnote/link URL properties using quran:, sunnah:, poetry:, book: and note:, and BagLib block reference properties. RE-5 must use these tested reference contracts or extend the derivation and its tests when its actual block schemas land.

manuscript_link has exactly document_id (cascade FK), target_scheme (the five approved schemes), target_id and block_id. Its primary key is (document_id, block_id, target_scheme, target_id), with a secondary index on (target_scheme, target_id). Duplicate references within a block collapse to one row. References are derived data without foreign keys to library or corpus entities.

One transaction saves snapshot, derived plain_text, title/mode, rebuilt link rows and rebuilt FTS rows. An error rolls back the whole save. manuscript_document_fts is FTS5 with document_id UNINDEXED, title and plain_text, using unicode61. Indexed title/text and queries use the same normalizeArabicText helper as the book_content_fts repository introduced by migration 011. This includes its existing ة/ه equivalence, so search can produce ambiguous orthographic matches. Canonical snapshot, title and plain_text retain diacritics. Search and active lists exclude trashed manuscripts, chapters and descendants of trashed chapters. A deletion trigger removes stale FTS rows on physical cascade.

## History and lifecycle

Reuse ADR-008 history_blob and entity_version, with entity_type manuscript_document. Autosave never writes history. A checkpoint hashes a stable version envelope containing exact snapshot, title and primary_mode with SHA-256, storing its UTF-8 byte length in history_blob. It appends one entity_version only when the hash differs from the latest checkpoint. Updated timestamps and hierarchy changes do not affect this content hash. Versions have schema_version 1 and persist independently of live entities.

Restore runs in a transaction, checkpointing the content being replaced when needed, applying the selected version through the same save/derivation path, and appending the restored state with action restore and restored_from_revision. Restoring an already-current checkpoint adds no duplicate. Version restore preserves current hierarchy and trash flags.

The renderer persistence controller debounces autosave for 1500 ms, serializes writes and checkpoints, and checkpoints on explicit save, document switch, close and a ten-minute interval. Failures retain the draft and propagate to the host or its error callback. RE-2 must call change for editor changes, await documentSwitch/close before leaving, and prevent native close until the awaited close succeeds. The controller alone cannot intercept application shutdown or synchronize BlockSuite changes. The RE-2 iframe host is a separate deliverable.

Manuscript trash changes only its deleted_at, preserving chapter trash states. Chapter trash hides its subtree through ancestry without overwriting descendant flags. Restoring a manuscript exposes only its previously active chapters. Restoring a chapter requires its manuscript and parent ancestry to be active. History and derived rows remain available for recovery. No purge interface is added.

## Renderer and assets

The self-contained ManuscriptList accepts language, the typed API and an optional open-document callback. It provides manuscript creation/rename/trash/restore, document creation/rename, parent selection, sibling ordering and chapter restore. Arabic/English strings come from translations.ts, and tree indentation uses CSS logical properties. RE-2 mounts it in its Editor tab. This task adds no shipped navigation entry.

manuscript-assets/<blobId> is the approved folder concept beside the database. RE-2 supplies its blob source and storage bridge, and RE-8 consumes it during export. Migration 029 adds no asset or board column, table or relationship.

## Evidence and references

- [Research Editor Plan revision 2.1](features/feature%20-%20Research%20Editor%20Plan.md), Storage and RE-3, with R3/R6 approvals.
- [ADR-008](ADR-008-version-history-and-recovery.md), history schema and recoverable versions.
- src/main/database/migrations/029_manuscripts.ts and migrations/index.ts.
- src/main/database/repositories/manuscript.repository.ts, src/shared/manuscript-snapshot.ts and src/shared/manuscripts.ts.
- src/main/ipc/manuscripts.ts, src/preload/index.ts and src/renderer/components/research/.
- tests/services/manuscripts.test.ts and tests/ui/manuscript-persistence.test.ts.
- scripts/manuscripts-live/ for copy-only real-database migration and isolated bilingual native verification.

This implementation extends local BagLib source and the approved plan. No third-party source or runtime was reverse engineered in KEY-364. BlockSuite round-trip evidence from the earlier spike belongs to that investigation. KEY-364 verifies exact serialized storage and hand-written snapshot derivation, with actual editor-host integration remaining in RE-2 and source blocks in RE-5.
