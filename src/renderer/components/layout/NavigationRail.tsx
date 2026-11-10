'use client';

import React from 'react';
import {
  ChevronRight,
  ChevronLeft,
  BookOpen,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { NAV_GROUPS, NAV_ITEMS, NAV_SECTIONS } from './nav-model';
import { NewObjectMenu } from './NewObjectMenu';

export const NavigationRail: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    isSidebarCollapsed,
    toggleSidebar,
    setSearchHubOpen,
    setIsSupportSheetOpen,
    activeBook,
    books,
    t,
    lang,
  } = useWorkspace();
  const { notes } = useStudyNotes();

  const handleItemClick = (id: string) => {
    const item = NAV_ITEMS[id];
    if (!item) return;

    if (item.actionType === 'searchHub') {
      setSearchHubOpen(true);
    } else if (item.actionType === 'boards') {
      setViewMode('notes');
      window.dispatchEvent(new CustomEvent('baglib:open-boards'));
    } else if (item.actionType === 'cards') {
      setViewMode('notes');
      window.dispatchEvent(new CustomEvent('baglib:open-cards'));
    } else if (item.actionType === 'support') {
      setIsSupportSheetOpen(true);
    } else if (item.viewMode) {
      setViewMode(item.viewMode);
    }
  };

  const getItemCount = (id: string): number => {
    switch (id) {
      case 'library':
        return books.length;
      case 'categories':
        return new Set(books.flatMap((b) => b.categories)).size;
      case 'notes':
        return notes.length;
      case 'reader':
        return activeBook ? 1 : 0;
      default:
        return 0;
    }
  };

  const isItemActive = (id: string): boolean => {
    const item = NAV_ITEMS[id];
    if (!item || !item.viewMode) return false;
    return viewMode === item.viewMode;
  };

  const renderItem = (itemId: string) => {
    const item = NAV_ITEMS[itemId];
    if (!item) return null;
    const Icon = item.icon;
    const isActive = isItemActive(itemId);
    const count = getItemCount(itemId);
    const label = t(item.labelKey);
    const tooltip = item.tooltipKey ? t(item.tooltipKey) : label;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleItemClick(item.id)}
        title={tooltip}
        aria-label={label}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full min-h-10 flex items-center gap-3 rounded-xl text-xs font-semibold leading-relaxed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
          isActive
            ? 'bg-primary/15 text-primary-text ring-1 ring-inset ring-primary-text/40'
            : 'text-muted hover:text-main hover:bg-canvas'
        } ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-center lg:justify-start px-1 lg:px-3'}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-text' : ''}`} />
        {!isSidebarCollapsed && (
          <span className="hidden lg:flex min-w-0 flex-1 items-center justify-between gap-2 py-2">
            <span className="truncate">{label}</span>
            {count > 0 && (
              <span className="shrink-0 text-[10px] px-1.5 rounded-full bg-canvas text-muted tabular-nums">
                {count.toLocaleString(lang)}
              </span>
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      aria-label={t('navGlobal')}
      className={`hidden md:flex h-full min-h-0 bg-surface border-e border-subtle flex-col transition-[width] duration-200 motion-reduce:transition-none z-30 shrink-0 select-none ${
        isSidebarCollapsed ? 'w-14 sm:w-16' : 'w-14 sm:w-16 lg:w-56'
      }`}
    >
      {/* Brand & Rail Collapse Header */}
      <div className="p-2 shrink-0 border-b border-subtle/60 flex items-center justify-between gap-2">
        {!isSidebarCollapsed ? (
          <button
            type="button"
            onClick={() => setViewMode('dashboard')}
            title={t('navDashboard')}
            className="hidden lg:flex items-center gap-2 px-1 py-1 rounded-lg text-start focus-visible:outline-2 focus-visible:outline-focus min-w-0 flex-1"
          >
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary-text/30 flex items-center justify-center text-primary-text shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-display text-sm font-bold text-main tracking-wide block truncate leading-tight">
                {t('brand')}
              </span>
              <span className="text-[10px] text-muted block truncate font-sans leading-tight">
                {t('brandSubtitle')}
              </span>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setViewMode('dashboard')}
            title={t('navDashboard')}
            className="w-8 h-8 rounded-lg bg-primary/10 border border-primary-text/30 flex items-center justify-center text-primary-text mx-auto shrink-0 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <BookOpen className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? t('expandMenu') : t('collapseMenu')}
          aria-expanded={!isSidebarCollapsed}
          aria-controls="workspace-navigation"
          title={isSidebarCollapsed ? t('expandMenu') : t('collapseMenu')}
          className={`p-1.5 rounded-xl bg-canvas hover:bg-surface border border-subtle text-muted hover:text-main transition-all cursor-pointer shrink-0 ${
            isSidebarCollapsed ? 'hidden' : 'hidden lg:flex'
          }`}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          ) : (
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          )}
        </button>

        {isSidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={t('expandMenu')}
            title={t('expandMenu')}
            className="p-1.5 rounded-xl bg-canvas hover:bg-surface border border-subtle text-muted hover:text-main transition-all cursor-pointer mx-auto mt-1"
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        )}
      </div>

      {/* Primary New Object + Button (D3) */}
      <div className="p-2 shrink-0 border-b border-subtle/60">
        <NewObjectMenu collapsed={isSidebarCollapsed} />
      </div>

      {/* Main Navigation Groups (Home, Library, Notes, Research, Islamic Studies) */}
      <nav
        id="workspace-navigation"
        aria-label={t('navGlobal')}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-2"
      >
        {NAV_SECTIONS.map((section) => (
          <section
            key={section.ariaLabelKey}
            aria-label={t(section.ariaLabelKey)}
            className="space-y-2 border-b border-subtle/60 pb-2 last:border-0"
          >
            {section.groupIds.map((groupId) => {
              const group = NAV_GROUPS.find((g) => g.id === groupId);
              if (!group) return null;
              return (
                <div key={group.id} className="space-y-1">
                  {!isSidebarCollapsed && (
                    <h2 className="hidden lg:block px-3 pt-1.5 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-muted font-sans">
                      {t(group.labelKey)}
                    </h2>
                  )}
                  {group.itemIds.map(renderItem)}
                </div>
              );
            })}
          </section>
        ))}
      </nav>

      {/* Pinned Bottom Settings and Support */}
      <div className="shrink-0 border-t border-subtle/60 p-2 space-y-1">
        {renderItem('settings')}
        {renderItem('support')}
      </div>

      {/* Bottom Status / Active Book Indicator */}
      {!isSidebarCollapsed && activeBook && (
        <div className="hidden lg:block shrink-0 p-3 border-t border-subtle/60 bg-canvas/40">
          <button
            type="button"
            onClick={() => setViewMode('reader')}
            title={t('navResumeBook')}
            aria-label={`${t('navResumeBook')}: ${activeBook.title}`}
            className="w-full text-start p-2.5 rounded-xl bg-surface border border-subtle hover:border-primary-text space-y-1 focus-visible:outline-2 focus-visible:outline-focus"
          >
            <span className="text-[10px] font-bold text-primary-text uppercase tracking-wider block">
              {t('currentBook')}
            </span>
            <span className="block text-xs font-bold text-main truncate leading-relaxed" dir="auto">
              {activeBook.title}
            </span>
            <span className="block text-[10px] text-muted truncate leading-relaxed" dir="auto">
              {activeBook.author}
            </span>
          </button>
        </div>
      )}
    </aside>
  );
};
