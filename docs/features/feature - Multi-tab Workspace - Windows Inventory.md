# Multi-tab workspace: inventory of single-window code (KEY-427, WS-12 groundwork)

Written 2026-11-19 by Claude Code. Tearing a tab off into its own window (plan section 7.2) needs a **registry of app windows** in place of the single `mainWindow`. This lists every main-process place that assumes one window, with its target. The registry is built and tested (`src/main/window-registry.ts`, `tests/main/window-registry.test.ts`) but not wired in. The menu-driven move spike is built (see the last section); real drag-out is not.

Verified by reading the code at commit c85e3dee: 48 matches for `mainWindow`, `getAllWindows()` and `getFocusedWindow()` under `src/main`.

## Targets

| Target | Meaning | Registry call |
|---|---|---|
| **Sender** | The reply goes to the window that asked | `fromWebContents(event.sender.id)` |
| **All** | Every app window: settings, theme, language, sync, notifications | `broadcast(channel, args)` |
| **Front** | The last focused window: OS-opened files, deep links, "bring to front" | `lastFocused()`, `bringToFront()` |
| **Primary** | The first window: startup splash, app lock, close flow | `primary()` |
| **Per window** | Runs once for each window when it's created | in the window factory |

## `src/main/index.ts` (33 uses)

| Lines | What it does | Target |
|---|---|---|
| 128 | `let mainWindow` | replaced by the registry |
| 132–133 | flushes pending `study:navigate` deep-link targets | **Front**. Readiness becomes per window (`studyNavigationReady` is global today) |
| 145 | trusts only IPC from the main window's main frame | `fromWebContents(sender)` plus the main-frame check, so any app window is trusted |
| 260–278 | creates the window, the editor context menu, and the loading/ready hooks | **Per window**: a `createAppWindow()` factory registers it and calls `noteFocus` on `focus` |
| 283, 520 | `const owner = mainWindow` for the close guard (ADR-012) | **Per window**: each window guards its own manuscript editor. Quitting the app asks each window in turn |
| 312–314, 337–339 | show and focus when ready | **Per window** |
| 317, 323 | did-fail-load, render-process-gone recovery | **Per window** |
| 332–353 | dev-server load retries and the `app://` fallback | **Per window** (same URL) |
| 371–378 | second instance: restore, focus, `reader:open-file` | **Front** |
| 389–399 | `open-file` / deep link: restore, show, focus, `reader:open-file` | **Front** |
| 499 | shutdown starts only while the window is alive | **Primary**. The app quits when the last app window closes (Windows/Linux) |

## Other modules (15 uses)

These already loop over `BrowserWindow.getAllWindows()`, so they work with several windows. But that list also contains helper windows (QUL browser, web clipper, companion widget), which then receive app messages. Switching them to `broadcast` keeps the messages to app windows.

| File:line | What | Target |
|---|---|---|
| ipc/advanced.ts:42 | rebuild progress | All |
| ipc/athan.ts:38, 45 | prayer-time events | All. The companion widget wants these too, so keep it included |
| ipc/boards.ts:18 | boards changed (skips the sender) | All except the sender |
| ipc/book-revision.ts:52 | revision events | All |
| ipc/knowledge-history.ts:28, ipc/study-notes.ts:45 | `study-notes:changed` | All |
| ipc/notifications.ts:13 | notification broadcast | All |
| ipc/notifications.ts:36 | picks the *first* window to show a notification | **Front**: the last focused window, not the first |
| ipc/pdf-editor.ts:55 | finds the owner by web-contents id | Sender (already correct) |
| ipc/pdf-editor.ts:63 | PDF editor events | All |
| ipc/quran.ts:129 | messages app windows by URL check | All (registry) instead of the URL test |
| services/metadata/pdf-page-cover.service.ts:43 | picks a window to render a cover | Primary (or a hidden worker window) |
| services/metadata/quotaTracker.ts:228 | quota warnings | All |
| services/deck-sync-scheduler.ts:103 | deck sync events | All |

## Open questions (for the spike)

- Pointer capture outside the window during a drag on Windows, including across monitors with different scaling. The plan names this as the main risk.
- Whether `pdf-page-cover.service` should use a hidden worker window, so it never depends on which app window is open.
- Memory with 2 windows of 6 tabs and real PDFs (each window is its own renderer process).

## Spike findings: "Move to new window" (2026-11-19, Antigravity)

**Built and verified** (unit tests `tests/main/workspace-windows.test.ts` and the wiring test; live run `scripts/tab-window-live`, real PDF, ar and en):

- Tab right-click menu, "Move to new window" / "نقل إلى نافذة جديدة". Single tab only (disabled for a multi-selection). Hidden inside a torn-off window.
- Renderer: `window.electronAPI.workspaceWindow.moveTab(payload)`. The payload (`src/shared/workspace-window-transfer.ts`) is `{ version: 1, history, index }`: the tab's history entries, with study target, title, scroll and view snapshot, but no tab id, group, or document content.
- Main (`src/main/workspace-windows.ts`): trusts only an app window as sender, validates the payload with `sanitizeLocation`, creates a window through the registry factory and keeps the payload until that window's renderer asks for it (`workspace:window-ready`). Pulling avoids a race with renderer startup. At most 8 payloads wait at once.
- `src/main/index.ts`: `createWindow({ secondary })` now registers every window in the window registry, passes `--baglib-secondary-window` to the preload, and keeps `mainWindow` pointing at the primary window (the next one if it closes). A secondary window does not reset `studyNavigationReady`.
- The new window opens with exactly the moved tab. It never reads or writes `workspace.tabs.v1` / `workspace.closed.v1` (the provider's `restoredRef` stays false), so the first window stays the owner of the saved workspace.
- The source closes the tab only after main confirms. A manuscript tab runs its unsaved-changes guard first; a refused or failed move keeps the tab.

**Bug found by the live run:** React runs the "ask for my tab" effect twice in development, and the tab is handed over once, so the second call got nothing. The preload now memoizes `ready()`.

**Real drag-out: findings, not built.**

- Electron has no cross-window drag of web content. A DOM drag ends when the pointer leaves the window, and `dragend` carries no usable target for another BrowserWindow. (Hypothesis from Electron/Chromium behavior; not tested here.)
- Pointer capture (`setPointerCapture`) should keep `pointermove` events coming outside the window on Windows, with `screenX/screenY`, so the renderer can tell when the pointer is outside its window. Not tested; mixed-DPI monitors are the open risk.
- What it needs: (1) on pointer release outside the window, the renderer sends the screen point with the payload; (2) main hit-tests all app windows (`getBounds()`, with `screen.dipToScreenPoint` for scaled displays) and either asks that window's tab bar to accept the tab (a new `workspace:receive-tab` message) or opens a new window at that point; (3) a drag ghost, since the browser drag image disappears outside the window; (4) an Escape/cancel path.
- Still open: the multi-window quit flow (`before-quit` closes only `mainWindow` today), restoring several windows after a restart, closing the last tab of a secondary window, per-window memory, deep links targeting a secondary window, and the helper windows (cover renderer, QUL browser, companion), which still use `getAllWindows()`.
