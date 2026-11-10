'use client';

import React, { useId, useRef } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  ariaLabel?: string;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  ariaLabel,
  className = '',
}) => {
  const { dir } = useWorkspace();
  const baseId = useId();
  const tablistRef = useRef<HTMLDivElement>(null);

  const enabledTabs = tabs.filter((t) => !t.disabled);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentId: string) => {
    if (enabledTabs.length === 0) return;

    const currentIndex = enabledTabs.findIndex((t) => t.id === currentId);
    let targetIndex = -1;

    const isRtl = dir === 'rtl';
    const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = isRtl ? 'ArrowRight' : 'ArrowLeft';

    if (event.key === nextKey) {
      event.preventDefault();
      targetIndex = (currentIndex + 1) % enabledTabs.length;
    } else if (event.key === prevKey) {
      event.preventDefault();
      targetIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    } else if (event.key === 'Home') {
      event.preventDefault();
      targetIndex = 0;
    } else if (event.key === 'End') {
      event.preventDefault();
      targetIndex = enabledTabs.length - 1;
    }

    if (targetIndex >= 0) {
      const nextTab = enabledTabs[targetIndex];
      onChange(nextTab.id);
      // Focus newly activated tab
      const tabButton = tablistRef.current?.querySelector<HTMLButtonElement>(
        `#${baseId}-tab-${nextTab.id}`
      );
      tabButton?.focus();
    }
  };

  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={ariaLabel}
      dir={dir}
      className={`inline-flex items-center gap-1 p-1 bg-canvas border border-border/70 rounded-xl select-none ${className}`}
    >
      {tabs.map((tab) => {
        const isSelected = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            id={`${baseId}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={isSelected}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={isSelected ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, tab.id)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              isSelected
                ? 'bg-surface text-text shadow-xs border border-border/50'
                : 'text-text-muted hover:text-text hover:bg-surface/50 border border-transparent'
            }`}
          >
            {tab.icon && (
              <span className="shrink-0 inline-flex size-3.5 items-center justify-center" aria-hidden="true">
                {tab.icon}
              </span>
            )}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export interface TabPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  tabId: string;
  activeTab: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({
  tabId,
  activeTab,
  children,
  className = '',
  ...props
}) => {
  const isSelected = tabId === activeTab;
  if (!isSelected) return null;

  return (
    <div
      role="tabpanel"
      id={`panel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      tabIndex={0}
      className={`outline-none focus-visible:outline-2 focus-visible:outline-focus ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
