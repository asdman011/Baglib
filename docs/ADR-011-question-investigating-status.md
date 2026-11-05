# ADR-011: Investigating status for open questions

## Status

Accepted on 2026-11-05. The user answered decision S2 of the PDF and Notes Experience Plan: "Yes, add it". Approval covers the status value below only. Implemented as migration 024.

## Context

- Migration 021 gave `question_detail` a status of `open`, `answered` or `dismissed`, enforced by a CHECK constraint.
- The user's note-engine design tracks research questions as Open → Investigating → Answered: a question being worked on should be told apart from one not yet started.

## Decision

- `question_detail.status` accepts `investigating` as well. Order in the interface: Open → Investigating → Answered, with Dismissed apart.
- SQLite cannot alter a CHECK constraint, so migration 024 rebuilds `question_detail` with identical columns, data and the `idx_question_capture` partial unique index. No other table changes; Work → Edition → Source untouched.
- `answered_at` is set only when a question becomes Answered, as before.
- Down migration rebuilds the old constraint and turns `investigating` back into `open`.
- History snapshots copy whole rows, so the status is versioned; restoring a snapshot taken before this migration keeps its older status values, all of which remain valid.

## Consequences

- The existing pre-migration backup runs before 024.
- Tests: up and down with data and index kept, the new status accepted and an unknown one refused, the IPC validation, and the questions list.
