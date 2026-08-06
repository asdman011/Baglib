'use client';

import React from 'react';
import {
  Library,
  BookOpen,
  FileText,
  Settings,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export const NavigationRail: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    isSidebarCollapsed,
    toggleSidebar,
    activeBook,
    books,
    bookNotes
  } = useWorkspace();

  const navItems = [
    {
      id: 'library',
      label: 'المكتبة',
      icon: Library,
      count: books.length,
      disabled: false,
    },
    {
      id: 'reader',
      label: 'القارئ الإشعاعي',
      icon: BookOpen,
      count: activeBook ? 1 : 0,
      disabled: !activeBook,
    },
    {
      id: 'notes',
      label: 'سجل الملاحظات',
      icon: FileText,
      count: bookNotes.length,
      disabled: false,
    },
    {
      id: 'settings',
      label: 'الإعدادات',
      icon: Settings,
      count: 0,
      disabled: false,
    },
  ];

  return (
    <aside
      className={`h-full bg-surface border-l border-subtle flex flex-col justify-between transition-all duration-300 z-30 shrink-0 select-none ${
        isSidebarCollapsed ? 'w-16' : 'w-56 sm:w-64'
      }`}
      dir="rtl"
    >
      {/* Top Header: Single Collapse/Expand Control (No Duplicate Logo) */}
      <div className="p-3 border-b border-subtle/60 flex items-center justify-between">
        {!isSidebarCollapsed && (
          <span className="text-xs font-bold text-muted font-sans px-2">
            التنقل العام
          </span>
        )}

        <button
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? 'توسيع القائمة' : 'طَي القائمة'}
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
              onClick={() => setViewMode(item.id as any)}
              title={isSidebarCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed text-muted'
                  : isActive
                  ? 'bg-pale-sky-500 text-white shadow-md shadow-pale-sky-500/20'
                  : 'text-muted hover:text-main hover:bg-canvas'
              } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon className="w-4 h-4 shrink-0" />

              {!isSidebarCollapsed && (
                <div className="flex-1 flex items-center justify-between truncate">
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
        <div className="p-3 border-t border-subtle/60 bg-canvas/40">
          <div className="p-2.5 rounded-xl bg-surface border border-subtle space-y-1">
            <span className="text-[10px] font-bold text-pale-sky-600 dark:text-pale-sky-300 uppercase tracking-wider block">
              الكتاب الحالي
            </span>
            <p className="text-xs font-bold text-main truncate">{activeBook.title}</p>
            <p className="text-[10px] text-muted truncate">{activeBook.author}</p>
          </div>
        </div>
      )}
    </aside>
  );
};
