/**
 * KEY-427 (WS-12) groundwork: the registry of BagLib app windows that replaces the single `mainWindow` once tabs can
 * be torn off into their own windows (plan 7.2). Not wired in yet; `src/main/index.ts` still keeps one window.
 *
 * Only app windows are registered. `BrowserWindow.getAllWindows()` also returns helper windows (the QUL browser,
 * the web clipper, the companion widget), so broadcasts meant for the app go through `broadcast` here.
 *
 * Targets, from the inventory in `docs/features/feature - Multi-tab Workspace - Windows Inventory.md`:
 * - a reply goes to the window that asked (`fromWebContents`);
 * - a broadcast (settings, theme, language, sync, notifications) goes to every app window (`broadcast`);
 * - "bring to front" and OS-opened files go to the last focused window (`lastFocused`, `bringToFront`);
 * - the startup splash and the app lock belong to the first window (`primary`).
 */

/** The part of an Electron `BrowserWindow` the registry uses, so it can be unit-tested without Electron. */
export interface RegistryWindow {
  readonly id: number;
  readonly webContents: { readonly id: number; send(channel: string, ...args: unknown[]): void };
  isDestroyed(): boolean;
  isMinimized?(): boolean;
  restore?(): void;
  show?(): void;
  focus?(): void;
}

export interface WindowRegistry<W extends RegistryWindow> {
  /** Adds an app window; the newest window counts as focused until another one is. */
  add(window: W): void;
  remove(window: W): void;
  /** Call from the window's `focus` event. */
  noteFocus(window: W): void;
  /** Live app windows, oldest first. */
  all(): W[];
  /** The first live window: it shows the startup splash and the app lock. */
  primary(): W | undefined;
  /** The most recently focused live window. */
  lastFocused(): W | undefined;
  /** The app window that owns these web contents (the sender of an IPC message), if any. */
  fromWebContents(webContentsId: number): W | undefined;
  /** Sends to every live app window, optionally skipping the sender. Returns how many received it. */
  broadcast(channel: string, args?: unknown[], options?: { exceptWebContentsId?: number }): number;
  /** Restores, shows and focuses the last focused window. Returns it, or undefined when none is open. */
  bringToFront(): W | undefined;
}

export function createWindowRegistry<W extends RegistryWindow>(): WindowRegistry<W> {
  let windows: W[] = [];
  /** Window ids, most recently focused first. */
  let focusOrder: number[] = [];

  const prune = () => {
    const dead = windows.filter(window => window.isDestroyed()).map(window => window.id);
    if (dead.length === 0) return;
    windows = windows.filter(window => !dead.includes(window.id));
    focusOrder = focusOrder.filter(id => !dead.includes(id));
  };

  const registry: WindowRegistry<W> = {
    add(window) {
      if (windows.some(existing => existing.id === window.id)) return;
      windows = [...windows, window];
      focusOrder = [window.id, ...focusOrder.filter(id => id !== window.id)];
    },
    remove(window) {
      windows = windows.filter(existing => existing.id !== window.id);
      focusOrder = focusOrder.filter(id => id !== window.id);
    },
    noteFocus(window) {
      if (!windows.some(existing => existing.id === window.id)) return;
      focusOrder = [window.id, ...focusOrder.filter(id => id !== window.id)];
    },
    all() {
      prune();
      return [...windows];
    },
    primary() {
      prune();
      return windows[0];
    },
    lastFocused() {
      prune();
      const id = focusOrder[0];
      return windows.find(window => window.id === id) ?? windows[windows.length - 1];
    },
    fromWebContents(webContentsId) {
      prune();
      return windows.find(window => window.webContents.id === webContentsId);
    },
    broadcast(channel, args = [], options = {}) {
      let sent = 0;
      for (const window of registry.all()) {
        if (window.webContents.id === options.exceptWebContentsId) continue;
        window.webContents.send(channel, ...args);
        sent += 1;
      }
      return sent;
    },
    bringToFront() {
      const window = registry.lastFocused();
      if (!window) return undefined;
      if (window.isMinimized?.()) window.restore?.();
      window.show?.();
      window.focus?.();
      return window;
    },
  };
  return registry;
}
