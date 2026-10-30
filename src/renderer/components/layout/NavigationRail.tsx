'use client';

import React from 'react';
import {
  Library,
  BookOpen,
  FileText,
  Settings,
  ChevronRight,
  ChevronLeft,
  Layers,
  Globe,
  BookOpenText,
  BookMarked,
  LayoutDashboard,
  Feather,
} from 'lucide-react';
import { useWorkspace, type WorkspaceViewMode } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';

export const NavigationRail: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    isSidebarCollapsed,
    toggleSidebar,
    setSearchHubOpen,
    activeBook,
    books,
    t
  } = useWorkspace();
  const { notes } = useStudyNotes();

  const navItems: Array<{
    id: WorkspaceViewMode | 'search';
    label: string;
    tooltip?: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
    disabled: boolean;
    onClick?: () => void;
  }> = [
    {
      id: 'dashboard',
      label: t('navDashboard'),
      icon: LayoutDashboard,
      count: 0,
      disabled: false,
    },
    {
      id: 'quran',
      label: t('navQuran'),
      icon: BookMarked,
      count: 0,
      disabled: false,
    },
    {
      id: 'sunnah',
      label: t('navSunnah'),
      icon: BookOpenText,
      count: 0,
      disabled: false,
    },
    {
      id: 'bayan',
      label: t('navBayan'),
      tooltip: t('navBayanTooltip'),
      icon: Feather,
      count: 0,
      disabled: false,
    },
    {
      id: 'library',
      label: t('navLibrary'),
      icon: Library,
      count: books.length,
      disabled: false,
    },
    {
      id: 'search',
      label: t('navSearch'),
      icon: Globe,
      count: 0,
      disabled: false,
      onClick: () => setSearchHubOpen(true),
    },
    {
      id: 'categories',
      label: t('navCategories'),
      icon: Layers,
      count: new Set(books.flatMap(b => b.categories)).size,
      disabled: false,
    },
    {
      id: 'reader',
      label: t('navReader'),
      icon: BookOpen,
      count: activeBook ? 1 : 0,
      disabled: !activeBook,
    },
    {
      id: 'notes',
      label: t('navNotes'),
      icon: FileText,
      count: notes.length,
      disabled: false,
    },
    {
      id: 'settings',
      label: t('navSettings'),
      icon: Settings,
      count: 0,
      disabled: false,
    },
  ];

  return (
    <aside
      className={`h-full bg-surface border-e border-subtle flex flex-col justify-between transition-all duration-300 z-30 shrink-0 select-none ${
        isSidebarCollapsed ? 'w-14 sm:w-16' : 'w-14 sm:w-16 lg:w-56'
      }`}
    >
      {/* Top Header: Single Collapse/Expand Control (No Duplicate Logo) */}
      <div className="p-3 border-b border-subtle/60 flex items-center justify-between">
        {!isSidebarCollapsed && (
          <span className="hidden lg:inline text-xs font-bold text-muted font-sans px-2">
            {t('navGlobal')}
          </span>
        )}

        <button
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? t('expandMenu') : t('collapseMenu')}
          className={`p-2 rounded-xl bg-canvas hover:bg-surface border border-subtle text-muted hover:text-main transition-all cursor-pointer ${
            isSidebarCollapsed ? 'mx-auto' : ''
          }`}
        >
          {isSidebarCollapsed ? (
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          ) : (
            <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
          )}
        </button>
      </div>

      {/* Main Navigation Items (Using Pale Sky Primary Accent) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = viewMode === item.id;

          return (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => {
                if (item.onClick) {
                  item.onClick();

                } else if (item.id !== 'search') {
                  setViewMode(item.id);
                }
              }}
              title={item.tooltip || item.label}
              aria-label={item.label}
              className={`w-full flex items-center gap-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed text-muted'
                  : isActive
                  ? 'bg-pale-sky-500 text-white shadow-md shadow-pale-sky-500/20'
                  : 'text-muted hover:text-main hover:bg-canvas'
              } ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-center lg:justify-start px-1 lg:px-3'}`}
            >
              <Icon className="w-4 h-4 shrink-0" />

              {!isSidebarCollapsed && (
                <div className="hidden lg:flex flex-1 items-center justify-between truncate">
                  <span className="truncate">{item.label}</span>
                  {item.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-subtle/50 text-muted'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Status / Active Book Indicator */}
      {!isSidebarCollapsed && activeBook && (
        <div className="hidden lg:block p-3 border-t border-subtle/60 bg-canvas/40">
          <div className="p-2.5 rounded-xl bg-surface border border-subtle space-y-1">
            <span className="text-[10px] font-bold text-pale-sky-600 dark:text-pale-sky-300 uppercase tracking-wider block">
              {t('currentBook')}
            </span>
            <p className="text-xs font-bold text-main truncate">{activeBook.title}</p>
            <p className="text-[10px] text-muted truncate">{activeBook.author}</p>
          </div>
        </div>
      )}
    </aside>
  );
};
