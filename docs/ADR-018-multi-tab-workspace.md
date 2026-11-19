# ADR-018: Multi-tab workspace

- **Status:** **Accepted.** The user decided the open questions on 2026-11-19 (plan section 6). The pure model is built in KEY-417 (WS-1). The UI follows in KEY-418 to KEY-425.
- **Drafted by:** Claude Code, for KEY-417.
- **Epic:** KEY-380. It unblocks KEY-381 (drag passages into a manuscript side by side).
- **Related:**
  - `docs/features/feature - Multi-tab Workspace.md` (the plan and delivery steps);
  - `docs/features/feature - Multi-tab Workspace - Tab State.md` (the user's keep-alive and snapshot spec);
  - ADR-008 (version history: an editor's save before sleep creates the usual entry);
  - ADR-012 (unified saving: mark and note undo already survives restarts).

## Context

- **One screen at a time today.** BagLib shows one screen, chosen by a single `viewMode` in `WorkspaceContext`.
- **Per-screen state is global.** That context also holds the open book, its page, notes and highlights.
- **The hook is widely used:** 200 files call `useWorkspace()`.
- **Navigation runs through module-level pending targets and window events,** which any mounted view would consume.
- **A place already has an address.** Every place in the app is named by a study-target string (`book:`, `quran:`, `sunnah:`, `poetry:`, `media:`, `note:`).

The user wants browser-style tabs, with:
- a **+** panel showing their most-used destinations and recent material;
- per-tab back and forward;
- tabs that keep their state and come back after a restart.

## Decision

1. **A pure, shared tab model** in `src/shared/workspace-tabs.ts`, with no React, DOM, IPC or storage.
   - **Tabs hold their own history.** A tab is `{ id, openedAt, lastActiveAt, history, index }`, and each history entry is a `TabLocation`: `{ view, target?, title, scroll?, snapshot? }`.
   - **A reducer** handles open, close, activate, move, duplicate, navigate, update, back, forward, go, reopen, openBeside and closeSplit. Ids and the clock are passed in, so it is deterministic and testable.
   - **Single-instance views** (Settings, Statistics) focus their existing tab instead of opening a second.
2. **History works like a browser.**
   - A change of view or item makes an entry. Scrolling and page turns update the current entry.
   - Navigating after going back drops the forward entries.
   - There are at most 50 entries per tab, trimmed farthest from the current entry first.
3. **Keep-alive (the user's decision).**
   - The 6 most recently used non-exempt tabs stay mounted. The active tab and the split tab always do.
   - Tabs that are playing, have an open dialog, or failed to save are exempt: they never sleep and don't count toward the 6.
   - Every other tab saves its snapshot, then sleeps.
4. **One snapshot format** serves sleep, restart and back/forward.
   - A view's own part is `{ version, data }`: plain JSON, at most about 16 KB, never document content.
   - **Validated on the way in** (`sanitizeSnapshot`): non-JSON values are dropped, and the largest fields are dropped until it fits.
   - **Validated again on the way out** (`readSnapshot`): another version gives nothing back, and an invalid field is dropped. Neither step throws.
5. **Storage uses the existing `settings` key-value store. There is no new table, column or dependency.**

   | Key | Contents | Cap |
   |---|---|---|
   | `workspace.tabs.v1` | the tabs, with history and snapshots | 30 tabs (the active and split tabs always kept) |
   | `workspace.prefs.v1` | `{ restoreTabs, restoreFocus, linkTarget }` | — |
   | `workspace.usage.v1` | `{ [view]: { count, lastUsedAt } }` | 20 destinations |
   | `workspace.recent.v1` | recently opened items, newest first, deduplicated | 30 |
   | `workspace.closed.v1` | the last closed tabs, for Ctrl+Shift+T | 10 |

   Saved values are validated on load:
   - an unknown view drops its entry;
   - an invalid target is cleared but the view is kept;
   - duplicate ids and second copies of single-instance views are dropped;
   - a broken value gives the defaults.
6. **Preferences (the user's decisions).**
   - **On startup:** restore previous tabs (default) or start fresh.
   - **After restoring, show:** a new Home tab (default) or the last tab. It is disabled unless restoring is on.
   - **Open links in:** a new tab (default) or the same tab. Ctrl+click, Cmd+click and middle-click do the opposite.
7. **"Most used"** ranks destinations by use count with a 14-day half-life. Until 5 uses are recorded, it shows Library, Quran and Sunnah.
8. **Context split (WS-2).**
   - A global provider keeps the shared state. A per-tab `TabScope` owns the view and the reader state.
   - `useWorkspace()` merges the two, so its 200 callers don't change.
   - Navigation events carry an optional tab id, and only the focused tab, or the named tab, consumes them.

## Consequences

- **Tabs can be saved, restored and shared later** (plan section 5a) without schema changes, because a place is a target string plus a small snapshot.
- **The model is fully unit-tested** (`tests/shared/workspace-tabs.test.ts`). The UI steps only wire it up.
- **A view without a snapshot hook** still restores to its target and scroll. The hooks are added view by view in WS-8.
- **Limits, recorded rather than hidden:**
  - an editor's in-memory typing undo may not survive sleep, while saved content and version history do;
  - search results are recomputed on wake;
  - exempt tabs can push memory past 6 live tabs, which is measured in WS-3 and WS-8.
- **If a later step seems to need a table or a column,** the work stops and the user is asked.
