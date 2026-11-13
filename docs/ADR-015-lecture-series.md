# ADR-015 — Ordered lecture series

## Status

Accepted under the user's 2026-11-13 approval of the dedicated lecture_series table and its ordered membership table, KEY-344. Migration 028 implements exactly the specified columns.

## Decision

lecture_series holds id, name, autoplay_next (boolean, default off), created_at and updated_at. lecture_series_item holds series_id and work_id with cascading foreign keys, position as an integer, composite primary key (series_id, work_id) and unique work_id. A lecture belongs to at most one series. Deleting a series preserves its Works. No collection reuse or additional schema fields are introduced.

Main validates names, identifiers, existing active lecture Works, booleans and exact permutations for reorder. Assignment and reorder are transactional. Assigning an existing member to its current series preserves order. Soft-deleted members remain hidden, and active-member reordering preserves hidden members' slots for restoration.

The Lectures view groups by series with native folding, editable names, deletion, per-series autoplay, completed/total progress and a thin progress bar. Lectures have drag ordering and keyboard-accessible move up/down buttons. A shared assignment picker is exposed from a lecture Work's Library menu. Unassigned lectures appear under Other lectures.

The existing audiobook_playback_progress.is_completed stores lecture completion. The player writes completion when position/duration reaches 95%, preserving the original lecture/Work identity. Earlier completion flags remain available until that lecture next saves progress, since legacy rows hold position without duration. No duration field or new progress table is added.

At playback end a next-lecture offer follows series order. With autoplay on a five-second countdown starts the next lecture, and the user can cancel the countdown or start immediately. Autoplay defaults off. Notes paths gain Lectures → series → lecture. Series ids use a series- prefix inside the existing folder path namespace, keeping unassigned lecture paths stable.

## Evidence and verification

Inspected the approved spec, ADR-014, Work repository, existing migrations including 013 playback state, Notes folder contracts and player lifecycle. Repository/migration tests check exact columns, FK/uniqueness, transactional reorder, membership moves, deletion behavior and restart persistence. Notes-tree tests cover the added level. Native verification and fixture limitations are recorded in docs/agent-ops/reports/KEY-344.md (local report).

This work extends BagLib source. No third-party application was reverse engineered. The user added real Arabic and English MP4s on 2026-11-13. Native acceptance uses both originals in one series with a generated third member, profile-only subtitle files and a second Electron process opening the same profile. Extra generated media covers container and chapter cases. Source files are read-only.
