# ADR-010: Comment threads, resolve state and anchors

## Status

Accepted on 2026-11-05. The user approved the PDF and Notes Experience Plan "as recommended", which includes decision D3 (this ADR and migration 023). Approval covers the two columns below only, not later schema, dependency or Git changes. Implemented on 2026-11-05 (Wave 9, first slice): `src/main/database/migrations/023_comment_threads.ts`, `CommentThreadService`, `CommentThreads` UI.

## Context

- The plan's Wave 9 adds a comment mode shared by the PDF reader, notes, ayahs and hadith: pins on a page or paragraph, threads, resolve and reopen, and filters such as "hide resolved" (learned from Figma and Acrobat; see `docs/features/Figma.md` and `docs/features/Adobe Acrobat Pro.md`).
- `comment` (migration 001) already has `parent_comment_id`, so threads need no change. It has no resolve state and no position inside the item it belongs to.
- PDF review comments in the file (`PdfReviewPanel`) already have a status and stay as they are.
- Keeping resolve only as history events was considered: every list and filter would then have to replay events, and "hide resolved" could not be a plain query.

## Decision

Migration 023 adds two nullable columns to `comment`:

| Column | Type | Meaning |
| --- | --- | --- |
| resolved_at | TEXT NULL | ISO time the thread was resolved; NULL means open. Set on the thread's root comment only. |
| anchor_json | TEXT NULL | Where a root comment sits inside its knowledge item: `{"kind":"page","page":12,"rect":[x,y,w,h]}`, `{"kind":"paragraph","anchor":"^a1b2"}` or `{"kind":"ref","target":"quran:hafs:2:255"}`. Validated in main; NULL means the whole item. |

One index: `idx_comment_open ON comment(knowledge_id) WHERE resolved_at IS NULL`.

- No new table, no change to `knowledge`, Work → Edition → Source untouched.
- History snapshots already copy whole `comment` rows, so resolve and anchors are versioned and restored with the item. Restoring an older snapshot leaves both columns NULL.
- Comments on ayahs and hadith hang off the existing personal commentary knowledge rows (`commentary:<reference>:<kind>`), so canonical text is never edited.
- Single user: `actor` stays the local display name.

## Consequences

- Down migration drops the index and the two columns (SQLite table rebuild).
- A pre-migration backup is taken by the existing migration backup path.
- Tests: migration up and down, anchor validation, resolve and reopen, snapshot round trip with and without the columns.
