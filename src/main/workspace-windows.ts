/**
 * KEY-427 (WS-12 spike): moves a tab into a new app window. The renderer sends the tab's history entries; main
 * validates them, opens a window through the injected factory and keeps the payload until that window's renderer
 * asks for it (`windowReady`). Pulling avoids a race with the renderer's startup. Kept free of Electron imports so it
 * can be unit-tested with fake windows.
 */
import { parseTabTransfer, type MoveTabResult, type TabTransferPayload, type WorkspaceWindowInfo } from '../shared/workspace-window-transfer';
import type { RegistryWindow, WindowRegistry } from './window-registry';

export interface TabTransferBroker {
  /** Handles a move request from the window that owns `senderWebContentsId`. */
  moveTabToNewWindow(senderWebContentsId: number, raw: unknown): Promise<MoveTabResult>;
  /** Handles `windowReady` from a window: its role and, once, the tab waiting for it. */
  windowReady(senderWebContentsId: number): WorkspaceWindowInfo;
}

export function createTabTransferBroker<W extends RegistryWindow>(options: {
  registry: WindowRegistry<W>;
  /** Opens a secondary app window and registers it. */
  createWindow: () => Promise<W> | W;
  /** At most this many tabs may wait for their window at once. */
  maxPending?: number;
}): TabTransferBroker {
  const { registry, createWindow, maxPending = 8 } = options;
  const pending = new Map<number, TabTransferPayload>();

  return {
    async moveTabToNewWindow(senderWebContentsId, raw) {
      // Only an app window may ask, and only for a well-formed tab.
      if (!registry.fromWebContents(senderWebContentsId)) return { ok: false };
      const payload = parseTabTransfer(raw);
      if (!payload || pending.size >= maxPending) return { ok: false };
      let window: W;
      try {
        window = await createWindow();
      } catch {
        return { ok: false };
      }
      if (window.isDestroyed()) return { ok: false };
      pending.set(window.webContents.id, payload);
      return { ok: true, windowId: window.id };
    },
    windowReady(senderWebContentsId) {
      const window = registry.fromWebContents(senderWebContentsId);
      const transfer = pending.get(senderWebContentsId);
      pending.delete(senderWebContentsId);
      return { primary: !!window && registry.primary()?.id === window.id, ...(transfer ? { transfer } : {}) };
    },
  };
}
