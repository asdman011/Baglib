# Multi-tab workspace: plan (epic KEY-380)

Status: **plan; the user's decisions were recorded on 2026-11-19 (section 6).** WS-1 (the pure model, ADR-018) is built; the UI is not.
Written 2026-11-19 by Claude Code. It unblocks KEY-381 (drag passages into a manuscript side by side).

## 1. What the user asked for (from KEY-380)

- A browser-style tab bar at the top of the app, showing every open tab.
- A **+** button next to the last tab opens a new tab on a dashboard page, where any material can be opened.
- Hovering **+** shows a small panel:
  - the most-used destinations, ranked by the user's own use (for example "Go to Library", "Go to Quran", "Go to Sunnah");
  - below them, recently opened material: books, lectures, notes and other items.
- Open questions in the epic: how tabs keep their state, whether tabs come back after a restart, and how usage and recents are stored.

## 2. How the app works today (verified in the code, 2026-11-19)

| Area | Today | What it means for tabs |
|---|---|---|
| Which screen shows | One `viewMode` in `WorkspaceContext` (15 values: dashboard, library, reader, quran, sunnah, bayan, lectures, notes, notes-editor, …). `AppLayout` renders exactly one view. | `viewMode` must become per tab. |
| Per-screen state | `WorkspaceContext` also holds `activeBook`, `readingPage`, `bookNotes`, `highlights` and `splitOrientation`. These belong to one reader, but they are global. | These move into a per-tab state. |
| Shared state | theme, language, direction, `books`, `categoryTree`, `allTags`, nav pin/peek, palette and search hub. | These stay global. |
| Hook users | **200 files** call `useWorkspace()`. | Its API must not change, or the refactor touches 200 files. |
| Navigation | Module-level "pending" targets plus window events: `openQuranAyah` (`QURAN_OPEN_EVENT`), `openSunnahReference`, `openPoetryReference`, `openLecture`, `openStudyNote`, `pendingCfi`/`pendingPage` for books. 7 views listen for these events. | With several readers open, only the focused tab may consume an event. |
| Addresses | One string scheme already names any place: `book:<id>#p=N`, `quran:<profile>:<s>:<a>`, `sunnah:<coll>:<chap>:<id>`, `poetry:…`, `media:<id>:<sec>`, `note:<id>` (`navigateStudyReference`). | A tab's location can be one of these strings, so tabs can be saved and restored without new tables. |
| Leaving the editor | `editorLeaveGuard` asks before leaving the research editor with unsaved changes. | The same guard runs when a tab holding the editor closes. |
| Recents that already exist | `recentlyOpenedBooks` (reading activity) and `islamic.continue.v1.*` (last Quran, Sunnah and poetry position). | The **+** panel reuses these and adds a small cross-material recents list. |

## 3. Proposed design

### 3.1 Tab model (pure shared module, unit-tested)

`src/shared/workspace-tabs.ts`:

```
TabDescriptor = { id, view: WorkspaceViewMode, target?: string /* study-target string */, title, openedAt }
TabsState     = { tabs: TabDescriptor[], activeId, splitId?: string /* second pane, step 6 */ }
```

- A pure reducer handles open, openBeside, close, activate, move, duplicate, navigate (the tab's view or target changes) and restore. It validates saved state: an unknown view is dropped, and an invalid target is cleared but the view is kept.
- **Single-instance views** (Settings, Statistics): opening one again focuses the existing tab instead of creating a second.
- Every other view can be open many times, for example two books or two Quran positions.

### 3.2 Per-tab state without touching 200 files

- `WorkspaceContext` splits in two:
  - a **global provider** (unchanged contents, minus the per-screen fields);
  - a **`TabScope` provider** that wraps each tab's view and owns `viewMode`, `activeBook`, `readingPage`, `bookNotes`, `highlights` and `splitOrientation`.
- `useWorkspace()` returns the global values merged with the nearest `TabScope`. Existing callers keep working as they are.
- `setViewMode` inside a tab navigates **that tab**, the way a link does in a browser.
- New hooks: `useTab()` (id, isFocused, target) and `useTabs()` (open, close, openInNewTab).

### 3.3 Navigation rules (decided)

- **A link inside content** (a hadith in a note, an ayah reference, a list item, a search result) follows the setting **"Open links in": a new tab (default) / the same tab**.
  - Ctrl+click and middle-click do the opposite of the setting.
  - The right-click menu always offers both "Open in new tab" and "Open here".
- **The navigation rail and the command palette** navigate the current tab, as a browser's address bar does.
- The pending-target helpers gain an optional tab id. View listeners act only when their tab is focused, or is the named target.

### 3.3a Back and forward in a tab (decided)

- **Each tab has its own history, like a browser.** A strip under the tab bar holds ← back and → forward arrows, mirrored in Arabic.
- **Shortcuts:** Alt+Left goes back and Alt+Right goes forward. In Arabic the arrows follow the visual direction. The mouse back and forward buttons also work.
- **Pressing and holding, or right-clicking, an arrow** shows that direction's history list, as Edge does: an icon and a title per entry. Clicking an entry jumps there.
- **What makes a history entry:**
  - a change of view;
  - opening a different item (another book, note, hadith, poem, lecture, or a jump to another ayah or page from a link).
  - Scrolling and page turns don't add entries; they update the current entry's snapshot.
- **Each entry stores the generic snapshot** (view, target, title, scroll) plus the view's snapshot, so going back restores the place exactly.
- **Caps:** at most 50 entries per tab. History is saved with the tab, so it survives sleep and restart, and the persisted entries are trimmed to stay within the size budget.

### 3.4 Keeping tab state (decided)

The full spec is in `feature - Multi-tab Workspace - Tab State.md`. In short:

- **The 6 most recently used tabs stay mounted,** hidden with `display:none`.
- **Older tabs sleep after saving a full snapshot first:**
  - the generic part: view, target, title, scroll;
  - plus each view's own `saveState` / `restoreState` hook, which runs the real save for editors.
- **Tabs that never sleep:**
  - a tab playing audio or video;
  - a tab with an open dialog;
  - a tab whose save failed.
- **One snapshot format serves sleep, restart and back/forward.** It is written on a short debounce while the tab is active.

### 3.5 Tab bar and the **+** panel

- **The tab bar** sits in the titlebar row (`Titlebar.tsx`), after the menu button.
  - Each tab shows an icon by kind, a title (book title, surah name, collection and number, note title…) and ×.
  - It scrolls when tabs overflow.
  - Tabs reorder by dragging. In Arabic the order runs right to left.
- **Keys:**
  - Ctrl+T new tab; Ctrl+W close; Ctrl+Shift+T reopen the last closed tab;
  - Ctrl+Tab / Ctrl+Shift+Tab next and previous; Ctrl+1…9 jump to a tab;
  - middle-click closes a tab.
- **The +** button sits right after the last tab. Clicking it opens a new tab on the dashboard. Hovering it, or focusing it and pressing ↓, opens the quick-open panel:
  - **Most used:** destinations ranked by use counts with a decay. Opening Library often puts it first. Until enough use is recorded, the panel shows Library, Quran and Sunnah.
  - **Recent:** up to 8 recently opened items: books, lectures, Quran, Sunnah and poetry positions, and notes. Each shows an icon and a title. Clicking one opens it in the new tab.

### 3.6 Restore after restart (decided)

Two settings, under Settings → Workspace:

1. **"On startup": restore previous tabs (default) / start fresh.**
   - Start fresh opens one Home tab.
2. **"After restoring, show": a new Home tab (default) / the tab I was on last.**
   - This option is disabled unless option 1 is set to restore.
   - **Example:** the app closed with 9 tabs. With the defaults, the next launch reopens all 9 and adds a **new Home tab, which is focused**, so the user can start something different.

Restored tabs come back asleep. Each wakes from its snapshot when first opened, so startup mounts only the focused tab.

### 3.7 Side by side (needed by KEY-381)

- "Open beside" in a tab's right-click menu, or dragging a tab to the side edge, shows two tabs in two panes with a resizable divider.
- The focused pane receives keyboard shortcuts and open requests.
- In Arabic the first pane is on the right.
- Once this exists, KEY-381 adds drag handles in the readers and drops passages into the research editor in the other pane. The editor already accepts `application/x-baglib-source` drops (KEY-370).

### 3.8 Storage: no schema change

Everything goes in the existing `settings` key-value store, the same as `dictionary.order.v1` and `islamic.continue.v1`. No new table, column or dependency.

| Key | Contents | Cap |
|---|---|---|
| `workspace.tabs.v1` | `TabsState`, plus each tab's snapshot and back/forward history | 30 tabs; about 16 KB per snapshot; 50 history entries per tab |
| `workspace.prefs.v1` | `{ restoreTabs: true, restoreFocus: 'new' \| 'last', linkTarget: 'new' \| 'same' }` | — |
| `workspace.usage.v1` | `{ [destination]: { count, lastUsedAt } }` | ~20 destinations |
| `workspace.recent.v1` | `[{ target \| view, title, openedAt }]`, deduplicated | 30 items |
| `workspace.closed.v1` | the last closed tabs, for Ctrl+Shift+T | 10 |

### 3.9 What stays global

These stay single, as now: the companion note pane (it follows the focused tab), the assistant, the command palette, the search hub, global dialogs, the status bar and the startup splash.

## 4. Risks

- **Event listeners in 7 views.** Two mounted Quran tabs would both react to `QURAN_OPEN_EVENT` without the focus filter. Step 2 adds the filter and a test that only the focused tab moves.
- **Memory.** Several PDF readers kept mounted are heavy. The keep-alive cap of 6 limits this, and step 3 measures it with real PDFs.
- **Code that assumes one view.** Some code reads `viewMode === 'reader'` globally (the companion pane, `data-workspace-motion`). These read the focused tab.
- **Live harnesses.** Existing `scripts/*-live` harnesses click `[data-nav-item]` and expect one view. With one tab open, the behaviour is the same as today, so they must keep passing. Step 2 is gated on that.

## 5. Delivery steps (Jira children of KEY-380)

| Step | Task | Depends on | Visible change |
|---|---|---|---|
| WS-1 | ADR-018 plus the pure model in `src/shared/workspace-tabs.ts`: tabs reducer, per-tab history, sleep selection (6 alive, exemptions), snapshot validation, prefs, usage ranking; unit tests | — | none |
| WS-2 | Split `WorkspaceContext` into global and `TabScope`; `useWorkspace` merges them; focus-filtered navigation events. One tab, behaviour unchanged. Full suite plus a regression pass of the existing live harnesses. | WS-1 | none |
| WS-3 | The tab bar in the titlebar: open, close, reorder, keys, RTL, overflow; keep-alive for 6 tabs, sleep with the generic snapshot and exemptions; a new tab opens Home | WS-2 | tabs appear |
| WS-4 | Back and forward per tab: the arrow strip under the tabs, Alt+Left/Right, mouse buttons, and hold or right-click for the history list | WS-3 | browser arrows |
| WS-5 | Links: the "Open links in" setting (new tab by default), Ctrl+click or middle-click for the opposite, and "Open in new tab" / "Open here" in right-click menus | WS-3 | links open tabs |
| WS-6 | The **+** quick-open panel (most used and recent) | WS-3 | + panel |
| WS-7 | Restore after restart with its two settings (restore by default; a new Home tab focused by default), reopen closed tab, unsaved-editor guard on tab close | WS-3 | tabs survive restart |
| WS-8 | Per-view `saveState` / `restoreState` hooks for every view in the tab-state table (editors save first), plus the 8-tab live run and memory measurement | WS-3 | sleeping tabs come back exactly |
| WS-9 | Side-by-side panes (open beside, drag a tab to the edge, resizable, focus routing) | WS-3 | split view |
| KEY-381 | Drag handles on ayahs, hadith, poetry lines and book selections, dropped into the manuscript in the other pane | WS-9 | drag into manuscript |

Jira: WS-1 KEY-417, WS-2 KEY-418, WS-3 KEY-419, WS-4 KEY-420, WS-5 KEY-421, WS-6 KEY-422, WS-7 KEY-423, WS-8 KEY-424, WS-9 KEY-425.

Order: WS-1 → WS-2 → WS-3, then WS-4 to WS-9 in table order. They touch mostly different files, but the work stays serial, one task at a time.

Each step: ar and en, live run with real files, harness windows off-screen, full suite green, one commit per task.

## 5a. Later: saving and sharing tabs (user, 2026-11-19)

- **Save tabs as a list.** This reuses personal lists. KEY-415 adds the list kinds tabs need:
  - lecture timestamps (`media:<id>:<s>`);
  - whole notes (`note:<id>`);
  - exact book pages (`book:<id>#p=N`).

  The Dashboard is never saved.
- **Sharing.** Book, lecture and note addresses break for someone who doesn't own that item. KEY-416 records the workarounds; the choice is a future decision.
- **Storage.** Live tab state stays in settings keys. Saved groups get a table only when that feature is built.

## 6. The user's decisions (2026-11-19)

1. **Tab state:** keep the 6 most recently used tabs alive. Older tabs save a full snapshot and then sleep. Tabs that are playing, have an open dialog, or failed to save never sleep. The spec is in `feature - Multi-tab Workspace - Tab State.md`.
2. **Restart:** a setting to restore previous tabs (default) or start fresh. A second setting, active only when restoring, shows either a new Home tab (default) or the last tab.
3. **Links:** a setting, "open in a new tab" (default) or "the same tab".
   - **Added by the user:** per-tab back and forward, with arrows under the tabs, Alt+Left/Right, and hold or right-click for the history list, as in Edge.
4. **Storage:** `settings` keys, with no new tables.
