'use client';

import React from 'react';
import { Titlebar } from './Titlebar';
import { CommandPalette } from './CommandPalette';
import { StatusBar } from './StatusBar';
import { NavigationRail } from './NavigationRail';
import { LibraryGridView } from '../library/LibraryGridView';
import { FullPageBookReader } from '../reader/FullPageBookReader';
import { NotesOverviewView } from '../notes/NotesOverviewView';
import { useWorkspace } from '../context/WorkspaceContext';
import { Settings } from 'lucide-react';
import { BotanicalVineLeft, BotanicalVineRight } from '../decorations/BotanicalIllustrations';

export const AppLayout: React.FC = () => {
  const { dir, viewMode } = useWorkspace();

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-canvas text-main select-none font-sans relative" dir={dir}>
      {/* Subtle Arabesque Pattern Texture Overlay */}
      <div className="absolute inset-0 bg-arabesque-pattern pointer-events-none z-0" />

      {/* Zone 1: Titlebar */}
      <Titlebar />

      {/* Main Body Layout with Collapsible Navigation Sidebar */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Collapsible Navigation Rail */}
        <NavigationRail />

        {/* Dynamic App Views */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Botanical Side Vine Illustrations (Oranges & Pomegranates) */}
          <BotanicalVineLeft />
          <BotanicalVineRight />

          {viewMode === 'library' && <LibraryGridView />}
          {viewMode === 'reader' && <FullPageBookReader />}
          {viewMode === 'notes' && <NotesOverviewView />}
          {viewMode === 'settings' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted font-sans space-y-3" dir="rtl">
              <Settings className="w-10 h-10 text-pale-sky-500" />
              <h2 className="font-bold text-lg text-main font-display">إعدادات المنصة والتفضيلات</h2>
              <p className="text-xs text-muted max-w-sm">هذا القسم مهيأ لإدارة الخطوط الحرة، أنماط العرض، والمزامنة في التحديثات القادمة.</p>
            </div>
          )}
        </main>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />

      {/* Global Search Command Palette (Cmd + K) */}
      <CommandPalette />
    </div>
  );
};
