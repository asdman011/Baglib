'use client';

/**
 * KEY-422 (WS-6): the quick-open panel under the tab bar's + button.
 *
 * - **Most used:** destinations ranked by use with a decay (`rankDestinations`); Library, Quran and Sunnah
 *   until enough use is recorded.
 * - **Recent:** up to 8 recently opened items (books, lectures, Quran, Sunnah and poetry places, notes), each
 *   with an icon and a title.
 *
 * Picking an entry opens it in a new tab. Arrow keys move through both sections, Enter picks, Escape closes.
 * Presentational: the workspace passes the ranked destinations and the recents.
 */
import React from 'react';
import type { TranslationKey } from '../../translations';
import type { RecentItem, TabLocation, WorkspaceView } from '../../../shared/workspace-tabs';
import { locationLabel, tabIcon } from './tab-bar-model';

/** How many recent items the panel shows. */
export const QUICK_OPEN_RECENT = 8;

export interface QuickOpenPanelProps {
  destinations: readonly WorkspaceView[];
  recent: readonly RecentItem[];
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onOpen: (location: TabLocation) => void;
  onClose: () => void;
  /** Focus the first entry when the panel opens from the keyboard. */
  autoFocus?: boolean;
}

export const QuickOpenPanel: React.FC<QuickOpenPanelProps> = ({ destinations, recent, t, onOpen, onClose, autoFocus }) => {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (autoFocus) panelRef.current?.querySelector<HTMLElement>('[data-quick-open-item]')?.focus();
  }, [autoFocus]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const all = [...(panelRef.current?.querySelectorAll<HTMLElement>('[data-quick-open-item]') ?? [])];
    if (all.length === 0) return;
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? all.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
    all[next]?.focus();
  };

  const item = (key: string, location: TabLocation, kind: 'destination' | 'recent') => {
    const Icon = tabIcon(location.view);
    const label = locationLabel(location, t);
    return (
      <button
        key={key}
        type="button"
        role="menuitem"
        data-quick-open-item={kind}
        data-quick-open-view={location.view}
        onClick={() => { onOpen(location); onClose(); }}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs leading-normal text-main hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate" dir="auto">{label}</span>
      </button>
    );
  };

  const shownRecent = recent.slice(0, QUICK_OPEN_RECENT);

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={t('workspaceQuickOpenLabel')}
      data-quick-open
      onKeyDown={onKeyDown}
      className="w-72 rounded-lg border border-subtle bg-surface p-1 shadow-lg"
    >
      <div role="group" aria-label={t('workspaceQuickOpenMostUsed')}>
        <p className="px-2 pb-1 pt-1.5 text-[0.6875rem] font-medium leading-normal text-muted">{t('workspaceQuickOpenMostUsed')}</p>
        {destinations.map(view => item(`view:${view}`, { view, title: '' }, 'destination'))}
      </div>
      <div role="group" aria-label={t('workspaceQuickOpenRecent')} className="mt-1 border-t border-subtle pt-1">
        <p className="px-2 pb-1 pt-1.5 text-[0.6875rem] font-medium leading-normal text-muted">{t('workspaceQuickOpenRecent')}</p>
        {shownRecent.length === 0
          ? <p className="px-2 py-1.5 text-xs leading-normal text-muted" data-quick-open-empty>{t('workspaceQuickOpenNoRecent')}</p>
          : shownRecent.map(entry => item(entry.target ?? `view:${entry.view}`, entry.target ? { view: entry.view, target: entry.target, title: entry.title } : { view: entry.view, title: entry.title }, 'recent'))}
      </div>
    </div>
  );
};
