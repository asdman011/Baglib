'use client';

/**
 * KEY-419 (WS-3) and KEY-420 (WS-4): the multi-tab workspace wired to the tab providers (WS-2).
 *
 * - `WorkspaceTabRow`: the tab bar, in its own row under the titlebar.
 * - `WorkspaceHistoryStrip`: the focused tab's back and forward arrows, under the tab bar.
 * - `WorkspaceTabPanels`: every awake tab mounted in its own `TabScope`, all but the focused one hidden; older
 *   tabs sleep after saving, and tabs playing audio or video never sleep.
 * - `useWorkspaceTabShortcuts`: Ctrl+T/W/Tab/1…9, Ctrl+Shift+T, Alt+Left/Right and the mouse back/forward buttons.
 */
import React from 'react';
import { TabScope, useTabs, useWorkspace } from '../context/WorkspaceContext';
import { editorLeaveGuard } from '../research/editor-leave';
import { activeTab, currentLocation, homeLocation, type TabLocation, type TabsState, type WorkspaceTab, type WorkspaceView } from '../../../shared/workspace-tabs';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { QuickOpenPanel } from './QuickOpenPanel';
import { useQuickOpenData } from './workspace-usage';
import { TabBar } from './TabBar';
import { TabKeepAlive } from './TabKeepAlive';
import { TabHistoryStrip } from './TabHistoryStrip';
import { useTabKeepAlive } from './use-tab-keep-alive';
import { historyShortcut, mouseHistoryButton, shortcutTarget, tabShortcut, type HistoryCommand, type TabCommand } from './tab-bar-model';

/** New tabs (+ and Ctrl+T) open at the end of the bar, like a browser. */
const lastTabId = (state: TabsState): string | undefined => state.tabs[state.tabs.length - 1]?.id;

/**
 * Closing a tab that holds the manuscript editor asks the editor first (it may have unsaved work). Other tabs
 * close at once. Only the focused tab's editor is mounted with a guard, so other tabs need no question.
 */
function useGuardedClose() {
  const { state, close } = useTabs();
  return React.useCallback((id: string) => {
    const tab = state.tabs.find(item => item.id === id);
    const guard = tab && id === state.activeId && currentLocation(tab).view === 'notes-editor' ? editorLeaveGuard() : undefined;
    if (!guard) { close(id); return; }
    void guard().then(allowed => { if (allowed) close(id); });
  }, [state, close]);
}

export const WorkspaceTabRow: React.FC = () => {
  const { dir, t, books } = useWorkspace();
  const { state, open, activate, move } = useTabs();
  const closeTab = useGuardedClose();
  const playing = usePlayingTabs();
  const quick = useQuickOpenData(state);

  // KEY-422: a pick from the + panel opens in a new tab at the end. A book opens from the tab's own entry; other
  // items (note, ayah, hadith, poem, lecture moment) go through the study navigation, aimed at the new tab.
  const openQuick = React.useCallback((location: TabLocation) => {
    const book = location.target?.startsWith('book:');
    const id = open(book ? location : { view: location.view, title: location.title }, { afterId: lastTabId(state) });
    if (location.target && !book) {
      void navigateStudyReference(location.target, books, () => {}, (noteId, anchor) => openStudyNote({ id: noteId, anchor, tabId: id }), id).catch(() => {});
    }
  }, [open, state, books]);

  return (
    <div className="relative z-[61] flex h-10 shrink-0 items-center border-b border-subtle bg-surface/80 px-2 sm:px-3" data-workspace-tab-row>
      <TabBar
        tabs={state.tabs}
        activeId={state.activeId}
        dir={dir}
        t={t}
        onActivate={activate}
        onClose={closeTab}
        onMove={move}
        playing={playing}
        onNew={() => { open(homeLocation(), { afterId: lastTabId(state) }); }}
        renderQuickOpen={({ close, autoFocus }) => (
          <QuickOpenPanel destinations={quick.destinations} recent={quick.recent} t={t} onOpen={openQuick} onClose={close} autoFocus={autoFocus} />
        )}
      />
    </div>
  );
};

export const WorkspaceHistoryStrip: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { dir, t } = useWorkspace();
  const { state, go } = useTabs();
  const tab = activeTab(state);
  return (
    // Above the full-page reader (z-50), so the history list can drop down over it.
    <div className="relative z-[60] flex h-8 shrink-0 items-center gap-2 px-2 sm:px-3" data-workspace-history-row>
      <TabHistoryStrip tab={tab} dir={dir} t={t} onGo={index => { if (tab) go(tab.id, index); }}>
        {children}
      </TabHistoryStrip>
    </div>
  );
};

/** The tabs whose screen is playing audio or video right now; they never sleep (ADR-018, Tab State spec). */
export function usePlayingTabs(): ReadonlySet<string> {
  const [playing, setPlaying] = React.useState<ReadonlySet<string>>(() => new Set());
  React.useEffect(() => {
    const scan = () => {
      const ids = new Set<string>();
      for (const media of document.querySelectorAll<HTMLMediaElement>('[data-tab-panel] audio, [data-tab-panel] video')) {
        if (!media.paused && !media.ended) {
          const id = media.closest<HTMLElement>('[data-tab-panel]')?.dataset.tabPanel;
          if (id) ids.add(id);
        }
      }
      setPlaying(previous => (previous.size === ids.size && [...ids].every(id => previous.has(id)) ? previous : ids));
    };
    // Media events don't bubble, so listen in the capture phase.
    const events = ['play', 'playing', 'pause', 'ended', 'emptied'] as const;
    for (const name of events) document.addEventListener(name, scan, true);
    return () => { for (const name of events) document.removeEventListener(name, scan, true); };
  }, []);
  return playing;
}

/** Each tab's screen: the view its own scope is on. */
const TabScreen: React.FC<{ render: (view: WorkspaceView) => React.ReactNode }> = ({ render }) => {
  const { viewMode } = useWorkspace();
  return <>{render(viewMode)}</>;
};

/**
 * Sleeping saves the generic snapshot, which already lives in the tab's history entry (view, target, title);
 * WS-8 adds each view's own part through `useTab().registerSnapshot` and may make this fail.
 */
const saveGenericSnapshot = async () => true;

export const WorkspaceTabPanels: React.FC<{ render: (view: WorkspaceView) => React.ReactNode }> = ({ render }) => {
  const { state } = useTabs();
  const playing = usePlayingTabs();
  const awake = useTabKeepAlive(state, playing, saveGenericSnapshot);
  const renderTab = React.useCallback((tab: WorkspaceTab) => (
    <TabScope tabId={tab.id}>
      <TabScreen render={render} />
    </TabScope>
  ), [render]);
  return <TabKeepAlive state={state} awake={awake} renderTab={renderTab} />;
};

/** Runs one tab command against the tab state. */
export function tabCommandEffect(state: TabsState, command: TabCommand): { kind: 'new' } | { kind: 'close'; id: string } | { kind: 'reopen' } | { kind: 'activate'; id: string } | null {
  switch (command.type) {
    case 'new': return { kind: 'new' };
    case 'reopen': return { kind: 'reopen' };
    case 'close': return state.activeId ? { kind: 'close', id: state.activeId } : null;
    default: {
      const id = shortcutTarget(state, command);
      return id && id !== state.activeId ? { kind: 'activate', id } : null;
    }
  }
}

export function useWorkspaceTabShortcuts(): void {
  const { dir } = useWorkspace();
  const { state, open, activate, go, reopenClosed } = useTabs();
  const closeTab = useGuardedClose();
  const latest = React.useRef({ state, dir, open, activate, go, reopenClosed, closeTab });
  React.useEffect(() => { latest.current = { state, dir, open, activate, go, reopenClosed, closeTab }; });

  React.useEffect(() => {
    const step = (command: HistoryCommand) => {
      const { state: current, go: jump } = latest.current;
      const tab = activeTab(current);
      if (!tab) return false;
      const index = command === 'back' ? tab.index - 1 : tab.index + 1;
      if (index < 0 || index >= tab.history.length) return false;
      jump(tab.id, index);
      return true;
    };
    const onKey = (event: KeyboardEvent) => {
      // Holding a key repeats only Ctrl+Tab (cycling through tabs), never close or new.
      if (event.defaultPrevented || (event.repeat && event.code !== 'Tab')) return;
      const command = tabShortcut(event);
      if (command) {
        const effect = tabCommandEffect(latest.current.state, command);
        event.preventDefault();
        if (!effect) return;
        if (effect.kind === 'new') latest.current.open(homeLocation(), { afterId: lastTabId(latest.current.state) });
        else if (effect.kind === 'reopen') latest.current.reopenClosed();
        else if (effect.kind === 'close') latest.current.closeTab(effect.id);
        else latest.current.activate(effect.id);
        return;
      }
      const history = historyShortcut(event, latest.current.dir);
      if (history && step(history)) event.preventDefault();
    };
    // The mouse's back and forward buttons; mousedown is prevented too so the page doesn't act on them.
    const onMouseDown = (event: MouseEvent) => { if (mouseHistoryButton(event.button)) event.preventDefault(); };
    const onMouseUp = (event: MouseEvent) => {
      const history = mouseHistoryButton(event.button);
      if (history && step(history)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
}
