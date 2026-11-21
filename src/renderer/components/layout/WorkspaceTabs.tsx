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
import { AppWindow, FolderPlus, Columns2, Copy, ListPlus, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { requestAssistant } from '../ai/AssistantContext';
import { TabScope, useTabs, useWorkspace } from '../context/WorkspaceContext';
import { formatTabsLinksWithAnnotations } from '../../utils/share-with-annotations';
import { editorLeaveGuard } from '../research/editor-leave';
import { activeTab, currentLocation, homeLocation, SINGLE_INSTANCE_VIEWS, TAB_GROUP_COLORS, type TabGroupColor, type TabLocation, type TabsState, type WorkspaceTab, type WorkspaceView } from '../../../shared/workspace-tabs';
import {
  canOpenSideBySide, clickTab, copyLinksText, extendSelection, listableTargets, menuTargets,
  normalizeSelection, otherTabIds, rangeTo, singleSelection, tabIdsAfter, tabTargetToListItem, toggleTab,
  type TabSelection,
} from '../../../shared/workspace-tab-selection';
import { personalLists, usePersonalLists } from '../../libs/personal-lists';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import type { MenuItemProps } from '../ui/Menu';
import { useToastOptional } from '../ui/Toast';
import { buildTabTransfer } from '../../../shared/workspace-window-transfer';
import { QuickOpenPanel } from './QuickOpenPanel';
import { useQuickOpenData } from './workspace-usage';
import { GROUP_COLOR_STYLES, TabBar } from './TabBar';
import { TabKeepAlive } from './TabKeepAlive';
import { TabHistoryStrip } from './TabHistoryStrip';
import { useTabKeepAlive } from './use-tab-keep-alive';
import { historyShortcut, mouseHistoryButton, shortcutTarget, tabLabel, tabShortcut, type HistoryCommand, type TabCommand } from './tab-bar-model';

/** New tabs (+ and Ctrl+T) open at the end of the bar, like a browser. */
const lastTabId = (state: TabsState): string | undefined => state.tabs[state.tabs.length - 1]?.id;

/**
 * Closing a tab that holds the manuscript editor asks the editor first (it may have unsaved work). Other tabs
 * close at once. Only the focused tab's editor is mounted with a guard, so other tabs need no question.
 */
function useGuardedClose() {
  const { state, close, activate } = useTabs();
  const closeOne = React.useCallback(async (id: string): Promise<boolean> => {
    const tab = state.tabs.find(item => item.id === id);
    // KEY-423 review: every manuscript tab, focused or in the background, has its own guard.
    const guard = tab && currentLocation(tab).view === 'notes-editor' ? editorLeaveGuard(id) : undefined;
    if (!guard) { close(id); return true; }
    // A background tab is brought forward first, so its "unsaved changes" question is on screen.
    if (id !== state.activeId) activate(id);
    const allowed = await guard();
    if (allowed) close(id);
    return allowed;
  }, [state, close, activate]);
  /**
   * KEY-427 (WS-12 spike): moves a tab into a new window. A manuscript tab's unsaved-changes guard runs first. The
   * tab closes here only after main confirms the new window holds it, so a failure never loses the tab.
   */
  const moveOut = React.useCallback(async (id: string, position?: { x: number; y: number }): Promise<boolean> => {
    const tab = state.tabs.find(item => item.id === id);
    const windows = typeof window !== 'undefined' ? window.electronAPI?.workspaceWindow : undefined;
    if (!tab || !windows) return false;
    const guard = currentLocation(tab).view === 'notes-editor' ? editorLeaveGuard(id) : undefined;
    if (guard) {
      if (id !== state.activeId) activate(id);
      if (!(await guard())) return false;
    }
    try {
      const transfer = buildTabTransfer(tab);
      const result = await windows.moveTab(position ? { ...transfer, position } : transfer);
      if (!result.ok) return false;
    } catch {
      return false;
    }
    close(id, { skipClosed: true });
    return true;
  }, [state, close, activate]);
  const closeTab = React.useCallback((id: string) => { void closeOne(id); }, [closeOne]);
  const closeMany = React.useCallback(async (ids: readonly string[]) => {
    for (const id of ids) {
      const closed = await closeOne(id);
      if (!closed) break;
    }
  }, [closeOne]);
  return { closeTab, closeMany, moveOut };
}

export const WorkspaceTabRow: React.FC = () => {
  const { dir, lang, t, books } = useWorkspace();
  const { state, open, activate, move, duplicate, reopenClosed, closedTabs, dispatchTabs, prefs } = useTabs();
  const toast = useToastOptional();
  const { closeTab, closeMany, moveOut } = useGuardedClose();
  const playing = usePlayingTabs();
  const quick = useQuickOpenData(state);

  // KEY-428 (WS-10): multi-select state (UI only, never saved).
  const [rawSelection, setRawSelection] = React.useState<TabSelection>(() => singleSelection(state.activeId));
  const selection = React.useMemo(() => normalizeSelection(state, rawSelection), [state, rawSelection]);
  const selectedIds = React.useMemo(() => new Set(selection.ids), [selection.ids]);

  // Clear multi-selection on Escape anywhere in the window.
  React.useEffect(() => {
    if (selection.ids.length <= 1) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRawSelection(singleSelection(state.activeId));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.ids.length, state.activeId]);

  const onTabClick = React.useCallback((id: string, modifiers: { ctrl: boolean; shift: boolean }) => {
    const change = modifiers.ctrl
      ? toggleTab(state, selection, id)
      : modifiers.shift
        ? rangeTo(state, selection, id)
        : clickTab(id);
    setRawSelection(change.selection);
    if (change.focus && change.focus !== state.activeId) activate(change.focus);
  }, [state, selection, activate]);

  const onClearSelection = React.useCallback(() => setRawSelection(singleSelection(state.activeId)), [state.activeId]);

  const onExtendSelection = React.useCallback((step: 1 | -1) => {
    const change = extendSelection(state, selection, step);
    setRawSelection(change.selection);
    if (change.focus && change.focus !== state.activeId) activate(change.focus);
  }, [state, selection, activate]);

  const onMoveSelection = React.useCallback((ids: string[], toIndex: number) => {
    const moving = new Set(ids);
    const rest = state.tabs.filter(tab => !moving.has(tab.id));
    const clamped = Math.max(0, Math.min(rest.length, toIndex));
    // Move each selected tab in order so the block lands at clamped.
    ids.forEach((id, offset) => move(id, clamped + offset));
  }, [state.tabs, move]);

  // Personal lists for "Add to list" in the tab right-click menu.
  const { lists } = usePersonalLists();
  const [newListTargets, setNewListTargets] = React.useState<string[] | null>(null);
  const [newListName, setNewListName] = React.useState('');

  const addTabsToList = React.useCallback(async (listId: string, targets: readonly string[]) => {
    const { targets: rawTargets, skipped } = listableTargets(state, targets);
    const items = rawTargets
      .map(ref => {
        const tab = state.tabs.find(item => currentLocation(item).target === ref);
        return tabTargetToListItem(ref, tab ? tabLabel(tab, t) : ref);
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    if (items.length === 0) {
      toast?.showToast({ message: t('workspaceTabListNoItems'), type: 'default' });
      return;
    }
    for (const item of items) await personalLists.add(listId, item);
    toast?.showToast({
      message: skipped > 0
        ? t('workspaceTabListAddedSkipped', { added: items.length, skipped })
        : t('workspaceTabListAdded', { added: items.length }),
      type: 'success',
    });
  }, [state, t, toast]);

  const submitNewList = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newListName.trim() || !newListTargets) return;
    const created = await personalLists.create(newListName.trim());
    const targets = newListTargets;
    setNewListTargets(null);
    setNewListName('');
    await addTabsToList(created.id, targets);
  };

  // KEY-422: a pick from the + panel opens in a new tab at the end. A book opens from the tab's own entry; other
  // items (note, ayah, hadith, poem, lecture moment) go through the study navigation, aimed at the new tab.
  const openQuick = React.useCallback((location: TabLocation) => {
    const book = location.target?.startsWith('book:');
    const id = open(book ? location : { view: location.view, title: location.title }, { afterId: lastTabId(state) });
    if (location.target && !book) {
      void navigateStudyReference(location.target, books, () => {}, (noteId, anchor) => openStudyNote({ id: noteId, anchor, tabId: id }), id).catch(() => {});
    }
  }, [open, state, books]);

  // KEY-425: a tab dropped on a side edge opens side by side with the focused tab (or, when it is the focused tab,
  // with the most recently used other tab). "end" puts it in the second pane, "start" in the first.
  const dropToEdge = React.useCallback((id: string, side: 'start' | 'end') => {
    const partner = id === state.activeId
      ? [...state.tabs].filter(tab => tab.id !== id).sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]?.id
      : state.activeId;
    if (!partner) return;
    if (side === 'end') {
      if (partner !== state.activeId) activate(partner);
      dispatchTabs({ type: 'openBeside', id });
    } else {
      activate(id);
      dispatchTabs({ type: 'openBeside', id: partner });
    }
  }, [state, activate, dispatchTabs]);

  // KEY-425: opens a tab side by side with the focused tab (or its most recent partner when right-clicking the
  // focused tab itself).
  const openBeside = React.useCallback((id: string) => {
    const target = id === state.activeId
      ? [...state.tabs].filter(tab => tab.id !== id).sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]?.id
      : id;
    if (target) dispatchTabs({ type: 'openBeside', id: target });
  }, [state.activeId, state.tabs, dispatchTabs]);

  // KEY-426 (WS-11): tab group create/edit dialog state.
  const [groupDialog, setGroupDialog] = React.useState<{ mode: 'create'; ids: string[] } | { mode: 'edit'; groupId: string } | null>(null);
  const [groupName, setGroupName] = React.useState('');
  const [groupColor, setGroupColor] = React.useState<TabGroupColor>('blue');

  const submitGroupDialog = (event: React.FormEvent) => {
    event.preventDefault();
    if (!groupDialog) return;
    if (groupDialog.mode === 'create') {
      const groupId = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      dispatchTabs({ type: 'group', ids: groupDialog.ids, groupId, name: groupName.trim(), color: groupColor });
    } else {
      dispatchTabs({ type: 'updateGroup', groupId: groupDialog.groupId, patch: { name: groupName.trim(), color: groupColor } });
    }
    setGroupDialog(null);
  };

  const groupColorLabel = React.useCallback((color: TabGroupColor) => {
    const map: Record<TabGroupColor, Parameters<typeof t>[0]> = {
      grey: 'workspaceGroupColorGrey', blue: 'workspaceGroupColorBlue', red: 'workspaceGroupColorRed',
      yellow: 'workspaceGroupColorYellow', green: 'workspaceGroupColorGreen', pink: 'workspaceGroupColorPink',
      purple: 'workspaceGroupColorPurple', cyan: 'workspaceGroupColorCyan',
    };
    return t(map[color]);
  }, [t]);

  const getGroupMenuItems = React.useCallback((groupId: string): MenuItemProps[] => {
    const group = (state.groups ?? []).find(item => item.id === groupId);
    if (!group) return [];
    const memberIds = state.tabs.filter(tab => tab.groupId === groupId).map(tab => tab.id);
    const items: MenuItemProps[] = [
      {
        id: 'group-rename',
        label: t('workspaceGroupRename'),
        onClick: () => { setGroupName(group.name); setGroupColor(group.color); setGroupDialog({ mode: 'edit', groupId }); },
      },
      {
        id: 'group-color',
        label: t('workspaceGroupChangeColor'),
        children: TAB_GROUP_COLORS.map(color => ({
          id: `group-color-${color}`,
          label: groupColorLabel(color),
          icon: <span className={`inline-block h-2.5 w-2.5 rounded-full ${GROUP_COLOR_STYLES[color].swatch}`} aria-hidden="true" />,
          onClick: () => dispatchTabs({ type: 'updateGroup', groupId, patch: { color } }),
        })),
      },
      {
        id: 'group-collapse',
        label: t(group.collapsed ? 'workspaceGroupExpand' : 'workspaceGroupCollapse'),
        onClick: () => dispatchTabs({ type: 'updateGroup', groupId, patch: { collapsed: !group.collapsed } }),
      },
      {
        id: 'group-ungroup',
        label: t('workspaceGroupUngroup'),
        onClick: () => dispatchTabs({ type: 'ungroup', groupId }),
      },
      {
        id: 'group-close',
        label: t('workspaceGroupClose'),
        danger: true,
        onClick: () => closeMany(memberIds),
      },
    ];
    if (window.electronAPI?.personalLists) {
      items.push({
        id: 'group-save-list',
        label: t('workspaceGroupSaveAsList'),
        icon: <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />,
        onClick: () => { setNewListTargets(memberIds); setNewListName(group.name || ''); },
      });
    }
    return items;
  }, [state.groups, state.tabs, t, groupColorLabel, dispatchTabs, closeMany]);

  const onToggleGroupCollapse = React.useCallback((groupId: string) => {
    const group = (state.groups ?? []).find(item => item.id === groupId);
    if (group) dispatchTabs({ type: 'updateGroup', groupId, patch: { collapsed: !group.collapsed } });
  }, [state.groups, dispatchTabs]);

  // KEY-428 (WS-10): full tab right-click menu (plan 7.4; window items arrive in WS-12).
  const getTabMenuItems = React.useCallback((pointerId: string): MenuItemProps[] => {
    const targets = menuTargets(state, selection, pointerId);
    if (targets.length === 0) return [];
    const items: MenuItemProps[] = [];
    if (targets.length > 1) {
      items.push({ id: 'selection-count', label: t('workspaceTabSelectionCount', { count: targets.length }), disabled: true });
    }
    const lastTarget = targets[targets.length - 1];
    items.push({
      id: 'new-after',
      label: t('workspaceTabNewAfter'),
      icon: <Plus className="h-3.5 w-3.5" aria-hidden="true" />,
      onClick: () => open(homeLocation(), { afterId: lastTarget }),
    });
    const canDup = targets.some(id => {
      const tab = state.tabs.find(item => item.id === id);
      return tab ? !SINGLE_INSTANCE_VIEWS.includes(currentLocation(tab).view) : false;
    });
    items.push({
      id: 'duplicate',
      label: t('workspaceTabDuplicate'),
      disabled: !canDup,
      onClick: () => { targets.forEach(id => duplicate(id)); },
    });
    const groupChildren: MenuItemProps[] = [
      {
        id: 'new-group',
        label: t('workspaceTabNewGroup'),
        onClick: () => { setGroupName(''); setGroupColor('blue'); setGroupDialog({ mode: 'create', ids: targets }); },
      },
      ...(state.groups ?? []).map(group => ({
        id: `add-to-group-${group.id}`,
        label: group.name || t('workspaceGroupUntitled'),
        icon: <span className={`inline-block h-2.5 w-2.5 rounded-full ${GROUP_COLOR_STYLES[group.color].swatch}`} aria-hidden="true" />,
        onClick: () => dispatchTabs({ type: 'addToGroup', ids: targets, groupId: group.id }),
      })),
    ];
    items.push({
      id: 'add-to-group',
      label: t('workspaceTabAddToGroup'),
      icon: <FolderPlus className="h-3.5 w-3.5" aria-hidden="true" />,
      children: groupChildren,
    });
    if (targets.some(id => !!state.tabs.find(tab => tab.id === id)?.groupId)) {
      items.push({
        id: 'remove-from-group',
        label: t('workspaceTabRemoveFromGroup'),
        onClick: () => dispatchTabs({ type: 'removeFromGroup', ids: targets }),
      });
    }
    if (canOpenSideBySide(targets)) {
      items.push({
        id: 'open-side-by-side',
        label: t('workspaceTabOpenSideBySide'),
        icon: <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />,
        onClick: () => { activate(targets[0]); dispatchTabs({ type: 'openBeside', id: targets[1] }); },
      });
    } else if (targets.length === 1 && state.tabs.length >= 2) {
      items.push({
        id: 'open-beside',
        label: t('workspaceTabOpenBeside'),
        icon: <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />,
        onClick: () => openBeside(targets[0]),
      });
    }
    if (typeof window !== 'undefined' && window.electronAPI?.workspaceWindow && !window.electronAPI.workspaceWindow.isSecondary) {
      items.push({
        id: 'move-to-new-window',
        label: t('workspaceTabMoveToNewWindow'),
        icon: <AppWindow className="h-3.5 w-3.5" aria-hidden="true" />,
        disabled: targets.length !== 1,
        onClick: () => {
          void moveOut(targets[0]).then(moved => {
            if (!moved) toast?.showToast({ message: t('workspaceTabMoveToNewWindowFailed'), type: 'danger' });
          });
        },
      });
    }
    const aiSources = targets
      .map(id => state.tabs.find(tab => tab.id === id))
      .filter((tab): tab is WorkspaceTab => Boolean(tab))
      .map(tab => tabTargetToListItem(currentLocation(tab).target ?? '', tabLabel(tab, t)))
      .filter((item): item is NonNullable<ReturnType<typeof tabTargetToListItem>> => Boolean(item))
      .map(item => ({ target: item.itemRef, label: item.label }));
    if (aiSources.length > 0) {
      items.push({
        id: 'add-to-ai',
        label: t('ctxAddToAiConversation'),
        icon: <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />,
        onClick: () => requestAssistant({ sources: aiSources }),
      });
    }
    const shareSourceOnly = prefs?.shareSourceOnly ?? false;
    items.push({
      id: 'copy-links',
      label: t('workspaceTabCopyLinks'),
      icon: <Copy className="h-3.5 w-3.5" aria-hidden="true" />,
      onClick: () => {
        void formatTabsLinksWithAnnotations(state, targets, tab => tabLabel(tab, t), lang, t, shareSourceOnly)
          .then(text => navigator.clipboard?.writeText(text))
          .catch(() => {});
        toast?.showToast({ message: t('workspaceTabLinksCopied', { count: targets.length }), type: 'success' });
      },
      children: [
        {
          id: 'copy-links-default',
          label: shareSourceOnly ? t('workspaceTabCopyLinksSourceOnly') : t('workspaceTabCopyLinksWithAnnotations'),
          onClick: () => {
            void formatTabsLinksWithAnnotations(state, targets, tab => tabLabel(tab, t), lang, t, shareSourceOnly)
              .then(text => navigator.clipboard?.writeText(text))
              .catch(() => {});
            toast?.showToast({ message: t('workspaceTabLinksCopied', { count: targets.length }), type: 'success' });
          },
        },
        {
          id: 'copy-links-alternate',
          label: shareSourceOnly ? t('workspaceTabCopyLinksWithAnnotations') : t('workspaceTabCopyLinksSourceOnly'),
          onClick: () => {
            void formatTabsLinksWithAnnotations(state, targets, tab => tabLabel(tab, t), lang, t, !shareSourceOnly)
              .then(text => navigator.clipboard?.writeText(text))
              .catch(() => {});
            toast?.showToast({ message: t('workspaceTabLinksCopied', { count: targets.length }), type: 'success' });
          },
        },
      ],
    });
    if (window.electronAPI?.personalLists) {
      const listChildren: MenuItemProps[] = [
        ...lists.map(list => ({
          id: `add-to-list-${list.id}`,
          label: list.name,
          onClick: () => addTabsToList(list.id, targets),
        })),
        {
          id: 'add-to-new-list',
          label: t('workspaceTabNewList'),
          onClick: () => { setNewListTargets(targets); setNewListName(''); },
        },
      ];
      items.push({
        id: 'add-to-list',
        label: t('workspaceTabAddToList'),
        icon: <ListPlus className="h-3.5 w-3.5" aria-hidden="true" />,
        children: listChildren,
      });
    }
    items.push({
      id: 'close',
      label: targets.length > 1 ? t('workspaceTabCloseMany', { count: targets.length }) : t('workspaceTabCloseOne'),
      icon: <X className="h-3.5 w-3.5" aria-hidden="true" />,
      shortcut: targets.length === 1 ? 'Ctrl+W' : undefined,
      onClick: () => closeMany(targets),
    });
    const others = otherTabIds(state, targets);
    if (others.length > 0) {
      items.push({
        id: 'close-others',
        label: t('workspaceTabCloseOthers'),
        onClick: () => closeMany(others),
      });
    }
    const after = tabIdsAfter(state, targets);
    if (after.length > 0) {
      items.push({
        id: 'close-after',
        label: t('workspaceTabCloseAfter'),
        onClick: () => closeMany(after),
      });
    }
    items.push({
      id: 'reopen-closed',
      label: t('workspaceTabReopenClosed'),
      icon: <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />,
      shortcut: 'Ctrl+Shift+T',
      disabled: closedTabs.length === 0,
      onClick: () => reopenClosed(),
    });
    return items;
  }, [state, selection, t, open, duplicate, activate, dispatchTabs, openBeside, toast, lists, addTabsToList, closeMany, moveOut, closedTabs.length, reopenClosed]);

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
        onDropToEdge={dropToEdge}
        onOpenBeside={openBeside}
        selectedIds={selectedIds}
        onTabClick={onTabClick}
        onClearSelection={onClearSelection}
        onExtendSelection={onExtendSelection}
        onMoveSelection={onMoveSelection}
        getTabMenuItems={getTabMenuItems}
        groups={state.groups}
        onToggleGroupCollapse={onToggleGroupCollapse}
        getGroupMenuItems={getGroupMenuItems}
        onMoveGroup={(groupId, toIndex) => dispatchTabs({ type: 'moveGroup', groupId, toIndex })}
        onDetachTab={typeof window !== 'undefined' && window.electronAPI?.workspaceWindow
          ? (id, position) => {
              void moveOut(id, position).then(moved => {
                if (!moved) toast?.showToast({ message: t('workspaceTabMoveToNewWindowFailed'), type: 'danger' });
              });
            }
          : undefined}
        onNew={() => { open(homeLocation(), { afterId: lastTabId(state) }); }}
        renderQuickOpen={({ close, autoFocus }) => (
          <QuickOpenPanel destinations={quick.destinations} recent={quick.recent} t={t} onOpen={openQuick} onClose={close} autoFocus={autoFocus} />
        )}
      />
      {groupDialog && (
        <div role="dialog" aria-modal="true" aria-label={t(groupDialog.mode === 'create' ? 'workspaceGroupCreate' : 'workspaceGroupRename')} data-group-dialog className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4" onClick={() => setGroupDialog(null)}>
          <form onSubmit={submitGroupDialog} onClick={event => event.stopPropagation()} className="w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-2xl">
            <h2 className="mb-3 text-sm font-semibold text-main">{t(groupDialog.mode === 'create' ? 'workspaceGroupCreate' : 'workspaceGroupRename')}</h2>
            <input
              autoFocus
              dir="auto"
              type="text"
              data-group-name-input
              value={groupName}
              onChange={event => setGroupName(event.target.value)}
              placeholder={t('workspaceGroupNamePlaceholder')}
              className="mb-3 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-main outline-none focus:border-primary"
            />
            <div className="mb-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t('workspaceGroupColorLabel')}>
              {TAB_GROUP_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={groupColor === color}
                  aria-label={groupColorLabel(color)}
                  data-group-color-pick={color}
                  onClick={() => setGroupColor(color)}
                  className={`h-6 w-6 rounded-full ${GROUP_COLOR_STYLES[color].swatch} ${groupColor === color ? 'ring-2 ring-main ring-offset-2 ring-offset-surface' : 'opacity-75 hover:opacity-100'}`}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setGroupDialog(null)} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-canvas">{t('cancel')}</button>
              <button type="submit" data-group-submit className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-text">{t(groupDialog.mode === 'create' ? 'workspaceGroupCreate' : 'workspaceGroupSave')}</button>
            </div>
          </form>
        </div>
      )}
      {newListTargets && (
        <div role="dialog" aria-modal="true" aria-label={t('workspaceTabNewList')} className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4" onClick={() => setNewListTargets(null)}>
          <form onSubmit={submitNewList} onClick={event => event.stopPropagation()} className="w-full max-w-sm rounded-xl border border-border bg-surface p-4 shadow-2xl">
            <h2 className="mb-3 text-sm font-semibold text-main">{t('workspaceTabNewList')}</h2>
            <input
              autoFocus
              type="text"
              value={newListName}
              onChange={event => setNewListName(event.target.value)}
              placeholder={t('listsNewPrompt')}
              className="mb-3 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-main outline-none focus:border-primary"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setNewListTargets(null)} className="rounded-lg px-3 py-1.5 text-xs text-muted hover:bg-canvas">{t('cancel')}</button>
              <button type="submit" disabled={!newListName.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-text disabled:opacity-50">{t('listsCreate')}</button>
            </div>
          </form>
        </div>
      )}
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

/** KEY-424 (WS-8): tabs with an open dialog or modal never sleep (Tab State spec rule 3). */
export function useOpenDialogTabs(): ReadonlySet<string> {
  const [dialogs, setDialogs] = React.useState<ReadonlySet<string>>(() => new Set());
  React.useEffect(() => {
    const scan = () => {
      const ids = new Set<string>();
      for (const dlg of document.querySelectorAll<HTMLElement>('[data-tab-panel] [role="dialog"], [data-tab-panel] [aria-modal="true"]')) {
        const id = dlg.closest<HTMLElement>('[data-tab-panel]')?.dataset.tabPanel;
        if (id) ids.add(id);
      }
      setDialogs(previous => (previous.size === ids.size && [...ids].every(id => previous.has(id)) ? previous : ids));
    };
    scan();
    if (typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(scan);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal', 'hidden'] });
      return () => observer.disconnect();
    }
    const deferredScan = () => { setTimeout(scan, 0); };
    document.addEventListener('click', deferredScan, true);
    return () => document.removeEventListener('click', deferredScan, true);
  }, []);
  return dialogs;
}

/** Each tab's screen: the view its own scope is on. */
const TabScreen: React.FC<{ render: (view: WorkspaceView) => React.ReactNode }> = ({ render }) => {
  const { viewMode } = useWorkspace();
  return <>{render(viewMode)}</>;
};

export const WorkspaceTabPanels: React.FC<{ render: (view: WorkspaceView) => React.ReactNode }> = ({ render }) => {
  const { dir, t } = useWorkspace();
  const { state, activate, dispatchTabs, saveTabSnapshot } = useTabs();
  const playing = usePlayingTabs();
  const dialogs = useOpenDialogTabs();
  const exempt = React.useMemo(() => {
    if (dialogs.size === 0) return playing;
    const next = new Set(playing);
    for (const id of dialogs) next.add(id);
    return next;
  }, [playing, dialogs]);
  const awake = useTabKeepAlive(state, exempt, saveTabSnapshot);
  const renderTab = React.useCallback((tab: WorkspaceTab) => (
    <TabScope tabId={tab.id}>
      <TabScreen render={render} />
    </TabScope>
  ), [render]);
  // KEY-425: the side-by-side row. Clicking into a pane focuses its tab (the focused pane gets shortcuts, open
  // requests and back/forward); the divider size is saved with the tabs.
  const split = React.useMemo(() => ({
    dir, t,
    onFocusTab: activate,
    onRatioChange: (ratio: number) => dispatchTabs({ type: 'setSplitRatio', ratio }),
    onCloseSplit: () => dispatchTabs({ type: 'closeSplit' }),
  }), [dir, t, activate, dispatchTabs]);
  return <TabKeepAlive state={state} awake={awake} renderTab={renderTab} split={split} />;
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
  const { closeTab } = useGuardedClose();
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
