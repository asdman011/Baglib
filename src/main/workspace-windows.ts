/**
 * KEY-427 (WS-12 spike): moves a tab into a new app window. The renderer sends the tab's history entries; main
 * validates them, opens a window through the injected factory and keeps the payload until that window's renderer
 * asks for it (`windowReady`). Pulling avoids a race with the renderer's startup. Kept free of Electron imports so it
 * can be unit-tested with fake windows.
 */
import {
  isPointInBounds, parseTabMoveRequest, WORKSPACE_WINDOW_CHANNELS,
  type MoveTabResult, type ScreenPoint, type TabTransferPayload, type WorkspaceWindowInfo,
} from '../shared/workspace-window-transfer';
import type { TabsState } from '../shared/workspace-tabs';
import type { RegistryWindow, WindowRegistry } from './window-registry';

interface PendingWindowInit {
  windowKey: string;
  transfer?: TabTransferPayload;
  savedTabs?: TabsState;
}

export interface TabTransferBroker {
  /** Handles a move request from the window that owns `senderWebContentsId`. */
  moveTabToNewWindow(senderWebContentsId: number, raw: unknown): Promise<MoveTabResult>;
  /** Registers a secondary window reopened on startup so `windowReady` delivers its saved tabs. */
  registerRestoredWindow(webContentsId: number, windowKey: string, savedTabs: TabsState): void;
  /** Handles `windowReady` from a window: its role and, once, the tab or saved state waiting for it. */
  windowReady(senderWebContentsId: number): WorkspaceWindowInfo;
  /** Returns the assigned `windowKey` for a secondary window's `webContents.id`. */
  getWindowKey(webContentsId: number): string | undefined;
  /** Cleans up tracking when a window closes. */
  forgetWindow(webContentsId: number): void;
}

export function createTabTransferBroker<W extends RegistryWindow>(options: {
  registry: WindowRegistry<W>;
  /** Opens a secondary app window and registers it. */
  createWindow: (options?: { position?: ScreenPoint }) => Promise<W> | W;
  /** At most this many tabs may wait for their window at once. */
  maxPending?: number;
}): TabTransferBroker {
  const { registry, createWindow, maxPending = 8 } = options;
  const pending = new Map<number, PendingWindowInit>();
  const windowKeys = new Map<number, string>();
  let nextKey = 1;

  const allocateKey = () => {
    const used = new Set(windowKeys.values());
    while (used.has(`win-${nextKey}`)) nextKey += 1;
    const key = `win-${nextKey}`;
    nextKey += 1;
    return key;
  };

  const findWindowAtPoint = (point: ScreenPoint, exceptWebContentsId: number): W | undefined => {
    const focused = registry.lastFocused();
    const candidates = registry.all().filter(w => w.webContents.id !== exceptWebContentsId && !w.isDestroyed() && !w.isMinimized?.());
    // Prefer the most recently focused window if windows overlap.
    if (focused && candidates.includes(focused)) {
      const rest = candidates.filter(w => w.id !== focused.id).reverse();
      candidates.splice(0, candidates.length, focused, ...rest);
    } else {
      candidates.reverse();
    }
    return candidates.find(w => {
      const bounds = w.getBounds?.();
      return bounds ? isPointInBounds(point, bounds) : false;
    });
  };

  return {
    async moveTabToNewWindow(senderWebContentsId, raw) {
      // Only an app window may ask, and only for a well-formed tab.
      if (!registry.fromWebContents(senderWebContentsId)) return { ok: false };
      const parsed = parseTabMoveRequest(raw);
      if (!parsed) return { ok: false };

      if (parsed.position) {
        const targetWindow = findWindowAtPoint(parsed.position, senderWebContentsId);
        if (targetWindow) {
          targetWindow.webContents.send(WORKSPACE_WINDOW_CHANNELS.receiveTab, parsed.payload);
          if (targetWindow.isMinimized?.()) targetWindow.restore?.();
          targetWindow.show?.();
          targetWindow.focus?.();
          return { ok: true, windowId: targetWindow.id, target: 'existing' };
        }
      }

      if (pending.size >= maxPending) return { ok: false };
      let window: W;
      try {
        window = await createWindow(parsed.position ? { position: parsed.position } : undefined);
      } catch {
        return { ok: false };
      }
      if (window.isDestroyed()) return { ok: false };
      const windowKey = allocateKey();
      windowKeys.set(window.webContents.id, windowKey);
      pending.set(window.webContents.id, { windowKey, transfer: parsed.payload });
      return { ok: true, windowId: window.id, target: 'new' };
    },
    registerRestoredWindow(webContentsId, windowKey, savedTabs) {
      windowKeys.set(webContentsId, windowKey);
      pending.set(webContentsId, { windowKey, savedTabs });
    },
    windowReady(senderWebContentsId) {
      const window = registry.fromWebContents(senderWebContentsId);
      const entry = pending.get(senderWebContentsId);
      pending.delete(senderWebContentsId);
      const primary = !!window && registry.primary()?.id === window.id;
      return {
        primary,
        ...(entry?.windowKey ? { windowKey: entry.windowKey } : {}),
        ...(entry?.transfer ? { transfer: entry.transfer } : {}),
        ...(entry?.savedTabs ? { savedTabs: entry.savedTabs } : {}),
      };
    },
    getWindowKey(webContentsId) {
      return windowKeys.get(webContentsId);
    },
    forgetWindow(webContentsId) {
      pending.delete(webContentsId);
      windowKeys.delete(webContentsId);
    },
  };
}
