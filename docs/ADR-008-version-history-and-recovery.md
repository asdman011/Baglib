# ADR-008: Knowledge-owned notes and recoverable history

## Status

Accepted by explicit user approval on 2026-11-02, including the eight corrected behavior contracts. Implementation pending; the KEY-234 prerequisite is being implemented first. This approval does not authorize downloads, commits, pushes or Jira mutations.

## Approved scope

Wave4a: KEY-240, KEY-242, KEY-241 and simple KEY-246, without new dependencies. Notes and reflections receive history first. Work, Edition and Source metadata history is a later step. Wave4b editor and Wave4c canvas/import remain separate phases.

## Storage contract

- Add history_blob(hash PK, content, byte_length, created_at) and entity_version(id PK, entity_type, entity_id, revision, snapshot_hash FK restricted, action, actor nullable, batch_id nullable, restored_from_revision nullable, schema_version, created_at). Unique entity_type/entity_id/revision; indexes on entity/time, snapshot_hash and batch_id. No cascading relationship to live entities.
- Add nullable knowledge.deleted_at. New study_note_detail(knowledge_id PK/FK knowledge cascade, title, content, aliases_json) and reading_reflection_detail(knowledge_id PK/FK knowledge cascade, entry_date, mood nullable, difficulty nullable 1..5, rating nullable 1..5, review, recommendations, lessons); index reflection entry_date. Tags, comments and collections use existing knowledge relationships.
- Rebuild reading_session preserving IDs/data/indexes, nullable work_id SET NULL, original_work_id and former_work_title. Extend the Work-deletion trigger to preserve/detach sessions. No new detail table has its own Work FK. Update preserved-item queries for every new knowledge type.
- Extend question_detail with status(open/answered/dismissed), answered_at nullable, source_ref nullable and capture_hash nullable. Unique partial source_ref/capture_hash where both non-null. No occurrence table. Plain authored text only; skip code/URLs/quotes/embedded corpus material where identifiable, capture opt-in, deduplicate exact question text per source.

## Required behavior

Knowledge/detail is authoritative for paired book notes; annotations is a reader projection. Every covered route (legacy library notes, knowledge saves, annotation notes, poetry knowledge, AI research saves, PDF reviews/replies/status, tag and collection changes) uses an atomic mutation/history boundary. No swallowed projection errors or annotation-first partial commits. New study_note/reading_reflection types require explicit reads/saves/DTOs and must not be indiscriminately mirrored into annotations.

Default reads exclude trashed knowledge, including cards, SRS, poetry, insights, search and preserved lists. Trash removes the annotation projection atomically; restore reconstructs it. Snapshot envelopes preserve full projection/review anchors and association IDs/labels. Missing or changed associations require explicit review/remapping, not silent global recreation. Restore appends a version without discarding the replaced version. Note restore never resets card review state.

The existing unused event_log is not written in parallel: entity_version carries action/actor/time/batch. This supersedes the DBML comment directing all history into event_log. The referenced ADR-001 document was not found during inspection; no contents are inferred.

Malformed legacy notes stay untouched and are reported through bounded recovery status; conversion is resumable per record after structural migration. Retain original study.note.v1 records at least one release. Missing Work references become null, not errors. Preserve exact free-text tag spellings through tag rows and knowledge_tag. Dashboard reads the unified store with deduplicated unconverted fallback.

Reading reflections reuse quote_detail for quotations and planner references for action items. Reading totals keep sessions separate from dwell; existing LEFT JOIN totals already retain detached sessions.

## Safety and privacy

Before migrations, make a verified plain backup with successful WAL checkpoint/exclusive migration ownership; no synchronous double-ZIP startup snapshot. On failure show a localized native dialog and stop before migrations. Test migration019 onward on a closed-app copy, never against the original library.

Retain history until explicit purge, with storage disclosure. Ordinary delete is recoverable; explicit erase removes live/projection/legacy/history records and exclusively owned derived captures, garbage-collects unreferenced blobs and clears caches. Shared referenced blobs remain. Explain that managed backups must also be explicitly removed, and external copies/SSD forensic erasure cannot be guaranteed.

Initial conversions/imports create one baseline per entity; no-op saves do not create versions; real saves remain distinct and batch-grouped. Future metadata enrichment records accepted outcomes, not intermediate provider responses. External imports are outside Wave4a. Canonical Quran/hadith/poetry text is never normalized or rewritten.

## Implementation gates

Recheck active agents, Git status and migration numbering before any migration. Enforce tests that fail when a covered write path omits history. Verify all new types in listPreserved and every deletion path, real-app ar/en, full tests/typecheck/lint. Exact dependency/version/license/size approval remains required before any future download. Jira completion requires separately authorized commit and successful push.
