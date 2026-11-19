'use client';

/**
 * KEY-419 (WS-3): mounts the awake tabs and shows only the focused one. Hidden tabs stay mounted with
 * `display:none`, so switching back is instant with everything as it was. Sleeping tabs are not rendered at all;
 * they come back from their snapshot when they wake.
 *
 * KEY-425 (WS-9): with two tabs side by side, the row lays out both panes with a divider between them. The panes
 * stay the same React children (only their CSS changes), so nothing remounts when a split starts or ends. In
 * Arabic the row runs right to left, so the first pane is on the right.
 */
import React from 'react';
import type { TabsState, WorkspaceTab } from '../../../shared/workspace-tabs';
import type { TranslationKey } from '../../translations';
import { DEFAULT_SPLIT_RATIO, clampRatio } from './split-model';
import { SplitDivider } from './SplitPanes';

export interface TabKeepAliveProps {
  state: TabsState;
  awake: ReadonlySet<string>;
  /** Renders one tab's screen; WS-2's `TabScope` wraps it. */
  renderTab: (tab: WorkspaceTab, visible: boolean) => React.ReactNode;
  /** KEY-425: what the side-by-side row needs. Without it a split is shown as the focused tab alone. */
  split?: {
    dir: 'rtl' | 'ltr';
    t: (key: TranslationKey, params?: Record<string, string | number>) => string;
    /** A click or focus inside a pane: that pane's tab becomes the focused one. */
    onFocusTab: (id: string) => void;
    onRatioChange: (ratio: number) => void;
    onCloseSplit: () => void;
  };
}

/** Which tab is in which pane. `splitSwapped` means the focused tab sits in the second pane. */
export function splitPanes(state: TabsState): { first: string; second: string } | null {
  if (!state.splitId || !state.activeId) return null;
  return state.splitSwapped ? { first: state.splitId, second: state.activeId } : { first: state.activeId, second: state.splitId };
}

export const TabKeepAlive: React.FC<TabKeepAliveProps> = ({ state, awake, renderTab, split }) => {
  const panes = split ? splitPanes(state) : null;
  const ratio = clampRatio(state.splitRatio ?? DEFAULT_SPLIT_RATIO);
  const rowRef = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={rowRef}
      dir={split?.dir}
      data-tab-panels={panes ? 'split' : 'single'}
      className={`flex min-h-0 min-w-0 flex-1 ${panes ? 'flex-row' : 'flex-col'}`}
    >
      {state.tabs.filter(tab => awake.has(tab.id) || tab.id === state.activeId).map(tab => {
        const pane = panes ? (tab.id === panes.first ? 'first' : tab.id === panes.second ? 'second' : null) : null;
        const visible = panes ? pane !== null : tab.id === state.activeId;
        const share = pane === 'first' ? ratio : 1 - ratio;
        return (
          <div
            key={tab.id}
            data-tab-panel={tab.id}
            data-split-pane={pane ?? undefined}
            data-focused={panes && tab.id === state.activeId ? '' : undefined}
            role="tabpanel"
            hidden={!visible}
            onPointerDownCapture={pane && tab.id !== state.activeId ? () => split!.onFocusTab(tab.id) : undefined}
            onFocusCapture={pane && tab.id !== state.activeId ? () => split!.onFocusTab(tab.id) : undefined}
            style={!visible ? { display: 'none' } : pane ? { order: pane === 'first' ? 0 : 2, flexBasis: `${share * 100}%`, flexGrow: 0, flexShrink: 1 } : undefined}
            className={[
              'relative flex min-h-0 min-w-0 flex-1 flex-col',
              pane ? `overflow-hidden rounded-lg ring-1 ${tab.id === state.activeId ? 'ring-primary/40' : 'ring-transparent'}` : '',
            ].join(' ')}
          >
            {renderTab(tab, visible)}
          </div>
        );
      })}
      {panes && split && (
        <SplitDivider
          dir={split.dir}
          t={split.t}
          ratio={ratio}
          boxRef={rowRef}
          onRatioChange={split.onRatioChange}
          onClose={split.onCloseSplit}
          style={{ order: 1 }}
        />
      )}
    </div>
  );
};
