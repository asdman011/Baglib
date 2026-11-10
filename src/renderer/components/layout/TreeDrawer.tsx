'use client';

import React from 'react';
import { BookOpen } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { Sheet } from '../ui/Sheet';
import { NAV_GROUPS, NAV_ITEMS, NAV_SECTIONS } from './nav-model';
import { NewObjectMenu } from './NewObjectMenu';

export const TreeDrawer: React.FC = () => {
  const {
    isMobileNavOpen,
    setIsMobileNavOpen,
    setIsSupportSheetOpen,
    viewMode,
    setViewMode,
    setSearchHubOpen,
    activeBook,
    books,
    t,
    lang,
  } = useWorkspace();
  const { notes } = useStudyNotes();

  if (!isMobileNavOpen) return null;

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
    setIsMobileNavOpen(false);
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

  return (
    <Sheet
      open={Boolean(isMobileNavOpen)}
      onClose={() => setIsMobileNavOpen(false)}
      side="start"
      title={
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setViewMode('dashboard');
              setIsMobileNavOpen(false);
            }}
            className="flex items-center gap-2.5 text-start focus-visible:outline-2 focus-visible:outline-focus rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary-text/30 flex items-center justify-center text-primary-text shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <span className="font-display text-base font-bold text-main block leading-tight">
                {t('brand')}
              </span>
              <span className="text-[10px] text-muted block font-sans leading-tight">
                {t('brandSubtitle')}
              </span>
            </div>
          </button>
        </div>
      }
    >
      <div className="flex flex-col h-full -m-4 sm:-m-6">
        {/* Primary New Object + Button */}
        <div className="p-3 shrink-0 border-b border-subtle/60">
          <NewObjectMenu onActionComplete={() => setIsMobileNavOpen(false)} />
        </div>

        {/* Grouped Navigation */}
        <nav aria-label={t('navGlobal')} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-3">
          {NAV_SECTIONS.map((section) => (
            <section key={section.ariaLabelKey} aria-label={t(section.ariaLabelKey)} className="space-y-2">
              {section.groupIds.map((groupId) => {
                const group = NAV_GROUPS.find((g) => g.id === groupId);
                if (!group) return null;
                return (
                  <div key={group.id} className="space-y-1">
                    <h3 className="px-3 pt-1 pb-0.5 text-[11px] font-bold uppercase tracking-wider text-muted font-sans">
                      {t(group.labelKey)}
                    </h3>
                    {group.itemIds.map((itemId) => {
                      const item = NAV_ITEMS[itemId];
                      if (!item) return null;
                      const Icon = item.icon;
                      const isActive = item.viewMode ? viewMode === item.viewMode : false;
                      const count = getItemCount(itemId);

                      return (
                        <button
                          key={itemId}
                          type="button"
                          onClick={() => handleItemClick(itemId)}
                          aria-label={t(item.labelKey)}
                          title={item.tooltipKey ? t(item.tooltipKey) : t(item.labelKey)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`w-full min-h-10 flex items-center justify-between gap-3 px-3 rounded-xl text-xs font-semibold leading-relaxed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                            isActive
                              ? 'bg-primary/15 text-primary-text ring-1 ring-inset ring-primary-text/40'
                              : 'text-muted hover:text-main hover:bg-canvas'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-text' : ''}`} />
                            <span className="truncate">{t(item.labelKey)}</span>
                          </div>
                          {count > 0 && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-canvas text-muted tabular-nums">
                              {count.toLocaleString(lang)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          ))}
        </nav>

        {/* Active Book Card in Drawer (if open) */}
        {activeBook && (
          <div className="shrink-0 p-3 border-t border-subtle/60 bg-canvas/40">
            <button
              type="button"
              onClick={() => {
                setViewMode('reader');
                setIsMobileNavOpen(false);
              }}
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

        {/* Pinned Bottom Settings and Support */}
        <div className="shrink-0 border-t border-subtle/60 p-2 space-y-1 bg-surface">
          {['settings', 'support'].map((id) => {
            const item = NAV_ITEMS[id];
            if (!item) return null;
            const Icon = item.icon;
            const isActive = item.viewMode ? viewMode === item.viewMode : false;

            return (
              <button
                key={id}
                type="button"
                onClick={() => handleItemClick(id)}
                aria-label={t(item.labelKey)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full min-h-9 flex items-center gap-3 px-3 rounded-xl text-xs font-semibold leading-relaxed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  isActive
                    ? 'bg-primary/15 text-primary-text ring-1 ring-inset ring-primary-text/40'
                    : 'text-muted hover:text-main hover:bg-canvas'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-text' : ''}`} />
                <span className="truncate">{t(item.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
};
