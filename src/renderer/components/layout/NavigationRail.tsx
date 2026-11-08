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
  CalendarDays,
  Route,
  Clapperboard,
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
    t,
    lang
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
      id: 'planner',
      label: t('plannerTitle'),
      icon: CalendarDays,
      count: 0,
      disabled: false,
    },
    {
      id: 'pathways',
      label: t('pathwaysTitle'),
      icon: Route,
      count: 0,
      disabled: false,
    },
    {
      id: 'lectures',
      label: t('lecturesTitle'),
      icon: Clapperboard,
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

  const groups = [
    { label: t('navRhythmGroup'), ids: ['dashboard', 'planner', 'pathways'] },
    { label: t('navSourcesGroup'), ids: ['quran', 'sunnah', 'bayan', 'library', 'lectures', 'categories', 'reader'] },
    { label: t('navKnowledgeGroup'), ids: ['notes', 'search'] },
  ];

  const renderItem = (item: typeof navItems[number]) => {
    const Icon = item.icon;
    const isActive = viewMode === item.id;
    return (
      <button
        key={item.id}
        type="button"
        disabled={item.disabled}
        onClick={() => {
          if (item.onClick) item.onClick();
          else if (item.id !== 'search') setViewMode(item.id);
        }}
        title={item.tooltip || item.label}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full min-h-10 flex items-center gap-3 rounded-xl text-xs font-semibold leading-relaxed transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pale-sky-500 ${
          item.disabled ? 'opacity-40 cursor-not-allowed text-muted' : isActive
            ? 'bg-pale-sky-500/15 text-main ring-1 ring-inset ring-pale-sky-500/40'
            : 'text-muted hover:text-main hover:bg-canvas'
        } ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-center lg:justify-start px-1 lg:px-3'}`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-pale-sky-500' : ''}`} />
        {!isSidebarCollapsed && (
          <span className="hidden lg:flex min-w-0 flex-1 items-center justify-between gap-2 py-2">
            <span className="truncate">{item.label}</span>
            {item.count > 0 && <span className="shrink-0 text-[10px] px-1.5 rounded-full bg-canvas text-muted tabular-nums">{item.count.toLocaleString(lang)}</span>}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      aria-label={t('navGlobal')}
      className={`h-full min-h-0 bg-surface border-e border-subtle flex flex-col transition-[width] duration-200 motion-reduce:transition-none z-30 shrink-0 select-none ${
        isSidebarCollapsed ? 'w-14 sm:w-16' : 'w-14 sm:w-16 lg:w-56'
      }`}
    >
      {/* Top Header: Single Collapse/Expand Control (No Duplicate Logo) */}
      <div className="p-2 shrink-0 border-b border-subtle/60 flex items-center justify-between">
        {!isSidebarCollapsed && (
          <span className="hidden lg:inline text-xs font-bold text-muted font-sans px-2">
            {t('navGlobal')}
          </span>
        )}

        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? t('expandMenu') : t('collapseMenu')}
          aria-expanded={!isSidebarCollapsed}
          aria-controls="workspace-navigation"
          title={isSidebarCollapsed ? t('expandMenu') : t('collapseMenu')}
          className={`p-2 rounded-xl bg-canvas hover:bg-surface border border-subtle text-muted hover:text-main transition-all cursor-pointer ${
            isSidebarCollapsed ? 'mx-auto' : ''
          }`}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          ) : (
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          )}
        </button>
      </div>

      {/* Main Navigation Items (Using Pale Sky Primary Accent) */}
      <nav id="workspace-navigation" aria-label={t('navGlobal')} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-2">
        {groups.map(group => (
          <section key={group.label} aria-label={group.label} className="space-y-1 border-b border-subtle/60 pb-2 last:border-0">
            {!isSidebarCollapsed && <h2 className="hidden lg:block px-3 pt-2 pb-1 text-[11px] font-medium leading-relaxed text-muted">{group.label}</h2>}
            {group.ids.map(id => navItems.find(item => item.id === id)).filter((item): item is typeof navItems[number] => !!item).map(renderItem)}
          </section>
        ))}
      </nav>
      <div className="shrink-0 border-t border-subtle/60 p-2">
        {navItems.filter(item => item.id === 'settings').map(renderItem)}
      </div>

      {/* Bottom Status / Active Book Indicator */}
      {!isSidebarCollapsed && activeBook && (
        <div className="hidden lg:block shrink-0 p-3 border-t border-subtle/60 bg-canvas/40">
          <button type="button" onClick={() => setViewMode('reader')} title={t('navResumeBook')} aria-label={`${t('navResumeBook')}: ${activeBook.title}`} className="w-full text-start p-2.5 rounded-xl bg-surface border border-subtle hover:border-pale-sky-500 space-y-1 focus-visible:outline-2 focus-visible:outline-pale-sky-500">
            <span className="text-[10px] font-bold text-pale-sky-600 dark:text-pale-sky-300 uppercase tracking-wider block">
              {t('currentBook')}
            </span>
            <span className="block text-xs font-bold text-main truncate leading-relaxed" dir="auto">{activeBook.title}</span>
            <span className="block text-[10px] text-muted truncate leading-relaxed" dir="auto">{activeBook.author}</span>
          </button>
        </div>
      )}
    </aside>
  );
};
