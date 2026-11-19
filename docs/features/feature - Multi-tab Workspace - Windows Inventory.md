# Multi-tab workspace: inventory of single-window code (KEY-427, WS-12 groundwork)

Written 2026-11-19 by Claude Code. Tearing a tab off into its own window (plan section 7.2) needs a **registry of app windows** in place of the single `mainWindow`. This lists every main-process place that assumes one window, with its target. The registry is built and tested (`src/main/window-registry.ts`, `tests/main/window-registry.test.ts`) but not wired in. The cross-window drag spike, which is WS-12's first step, has not been done.

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
