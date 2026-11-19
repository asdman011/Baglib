'use client';

/**
 * KEY-419 (WS-3): mounts the awake tabs and shows only the focused one (and the split one, WS-9). Hidden tabs
 * stay mounted with `display:none`, so switching back is instant with everything as it was. Sleeping tabs are
 * not rendered at all; they come back from their snapshot when they wake.
 */
import React from 'react';
import type { TabsState, WorkspaceTab } from '../../../shared/workspace-tabs';

export interface TabKeepAliveProps {
  state: TabsState;
  awake: ReadonlySet<string>;
  /** Renders one tab's screen; WS-2's `TabScope` wraps it. */
  renderTab: (tab: WorkspaceTab, visible: boolean) => React.ReactNode;
}

export const TabKeepAlive: React.FC<TabKeepAliveProps> = ({ state, awake, renderTab }) => (
  <>
    {state.tabs.filter(tab => awake.has(tab.id) || tab.id === state.activeId).map(tab => {
      const visible = tab.id === state.activeId || tab.id === state.splitId;
      return (
        <div
          key={tab.id}
          data-tab-panel={tab.id}
          role="tabpanel"
          hidden={!visible}
          style={visible ? undefined : { display: 'none' }}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {renderTab(tab, visible)}
        </div>
      );
    })}
  </>
);
