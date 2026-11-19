# Multi-tab workspace: plan (epic KEY-380)

Status: **plan; the user's decisions were recorded on 2026-11-19 (section 6).** WS-1 (the pure model, ADR-018) and WS-2 (`WorkspaceContext` split) are built; the tab bar UI is not.
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

## 7. Added by the user (2026-11-19): tear-off windows, drag to reorder, multi-select and the tab menu

The user asked for these to work as tabs do in Chrome and Edge.

### 7.1 Drag to reorder

- **Dragging a tab along the tab bar moves it,** to the right or to the left. The other tabs slide aside while it moves. This is part of WS-3.
- **The order follows the language.** In Arabic the first tab is on the right, so the tab bar mirrors.
- **Several selected tabs move together** (7.3). A group moves as one block (7.5).

### 7.2 Tear a tab off into its own window (WS-12)

- **Dragging a tab out of the tab bar opens it in a new window,** like Chrome.
  - The tab counts as torn off once the pointer leaves the bar by more than about 30 px.
  - While dragging, a small preview of the tab follows the pointer.
  - On release, a new BagLib window opens at that spot, holding the tab.
- **Dropping a tab onto another BagLib window's tab bar moves it into that window,** at the drop position.
- **Dragging the only tab of a window moves the whole window,** as in Chrome.
- **Selected tabs or a group tear off together.**
- **The tab's right-click menu offers the same thing:** "Move to new window", and "Move to window ▸" with a list of the open windows.
- **Nothing is lost on the way.** Moving a tab works like sleep (Tab State spec):
  - The tab saves first, and an editor runs its normal save.
  - It sends its snapshot and history to the other window, which restores it there.
  - A tab that is playing or has a dialog open asks before it moves. A tab whose save failed doesn't move.
- **How it works:**
  - **Main process.** A window registry replaces the single `mainWindow`. About 33 places in `src/main` assume one window. Each one gets the right target:
    - replies go to the window that asked;
    - broadcasts (settings, theme, language, sync and notifications) go to every window;
    - "bring to front" goes to the last focused window.
  - **Renderer.** Each window runs its own tab model. Pointer capture keeps the drag going outside the window. On release, main checks whether a BagLib window's tab bar is under the screen point, and either moves the tab there or opens a new window.
  - **Settings.** Every window reads the same `settings`. A change in one window (language, theme, the `workspace.prefs.v1` options) reaches the others through a settings-changed broadcast to all windows.
- **Single instances apply across windows.** Opening Settings or Statistics focuses the window and tab that already show it.
  - **The same manuscript is open in only one tab at a time.** Opening it again focuses that tab, so two editors never save over each other.
- **Restore covers windows.** `workspace.tabs.v1` gains a `windows` list (each with its bounds and its tabs) through a versioned migration of the settings value, still with no schema change. On launch every window comes back, and the restore settings from 3.6 apply to each window.
- **Keep-alive is per window.** Each window keeps its own 6 tabs awake. Every window is its own renderer process, so memory is measured with real PDFs, with 2 windows of 6 tabs.
- **The startup splash and the app lock** appear only in the first window. Locking the app locks every window.
- **Risk.** A drag across monitors with different scaling on Windows is checked in the live run. If cross-window drag proves unreliable, the menu items still work. The first step of WS-12 is a short spike to prove the drag before the rest is built.

### 7.3 Select several tabs (WS-10)

| Action | Result |
|---|---|
| Click | Selects and focuses that tab, and clears the selection |
| Ctrl+click | Adds or removes a tab from the selection |
| Shift+click | Selects every tab from the focused tab to the clicked one |
| Esc | Clears the selection |

- **Selected tabs are highlighted.** The focused tab is always part of the selection.
- **Keyboard:** Ctrl+Shift+←/→ extends the selection. The arrows follow the visual direction in Arabic.

### 7.4 The tab right-click menu (WS-10)

The menu acts on the selection, or on the tab under the pointer when nothing is selected. When several tabs are selected, the menu title says how many ("3 tabs").

| Item | What it does |
|---|---|
| New tab to the right | Opens a Home tab after this one; "to the left" in Arabic, following the bar's direction |
| Duplicate | Copies each selected tab, with its history |
| Add to group ▸ | "New group…" (name and colour), or an existing group (7.5) |
| Remove from group | Shown when a selected tab is in a group |
| Open side by side | Shown when exactly 2 tabs are selected. Shows both in the split view (WS-9) |
| Move to new window / Move to window ▸ | 7.2 |
| Copy links | Copies one line per tab: the title and its `baglib:` deep link (`src/shared/deep-link.ts`). Tabs without an item, such as Home or Library, copy their title only |
| Add to list ▸ | Adds each tab's item to a personal list, or "Save as a new list…". It uses the KEY-415 kinds: book page, Quran, hadith, poem, lecture moment, note. Tabs without an item are skipped, and a short message says how many |
| Share ▸ | Waits for the KEY-416 decision, because book, lecture and note links break for someone who doesn't own the item. Until then the item is hidden and "Copy links" is the way to share |
| Close / Close other tabs / Close tabs to the right | "To the right" follows the bar's direction. An unsaved editor asks first (WS-7) |
| Reopen closed tab | Ctrl+Shift+T |

### 7.5 Tab groups (WS-11)

- **What a group is.** It has a name and one of 8 colours. It appears as a coloured label in front of its tabs, with a line of the same colour under them.
- **Collapsing.** Clicking the label collapses the group to just its label, and clicking again expands it. A collapsed group's tabs sleep (Tab State rules, exemptions still apply).
- **The label's right-click menu:** rename, change colour, collapse, ungroup, close the group, move the group to a new window, and save the group as a list.
- **Dragging.** Dragging the label moves the whole group, within the bar, into another window or into a new window. Dragging a tab out of the group removes it from the group.
- **Restore.** Groups are saved with the tabs in `workspace.tabs.v1` and come back after a restart. No table: "save the group as a list" is how a group is kept for good (5a).

### 7.6 Delivery

| Step | Task | Depends on | Visible change |
|---|---|---|---|
| WS-10 | Multi-select (click, Ctrl, Shift, Esc, keys) and the tab right-click menu (7.4), except the window and group items, which arrive with WS-11 and WS-12. The model gains a selection with tests. | WS-7 | select tabs, tab menu |
| WS-11 | Tab groups (7.5). The model gains groups (name, colour, collapsed), with tests. | WS-10 | coloured groups |
| WS-12 | Windows: a spike first, then the main-process window registry, tear-off, dropping into another window, the "Move to window" menu, multi-window restore and per-window keep-alive, with a memory check | WS-10 | tabs as windows |

Jira: WS-10 KEY-428, WS-11 KEY-426, WS-12 KEY-427. KEY-423 (WS-7) blocks KEY-428, which blocks KEY-426 and KEY-427.

Order: these follow WS-9. KEY-381 still only needs WS-9.
