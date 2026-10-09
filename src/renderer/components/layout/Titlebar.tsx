'use client';

import React from 'react';
import {
  Search,
  Moon,
  Sun,
  Globe,
  Command,
  BookOpen,
  Eye
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { HeaderBotanicalAccent } from '../decorations/BotanicalIllustrations';

export const Titlebar: React.FC = () => {
  const {
    dir,
    theme,
    lang,
    isZenMode,
    toggleZenMode,
    toggleLanguage,
    toggleTheme,
    setCommandPaletteOpen,
    t,
  } = useWorkspace();

  return (
    <header className="h-12 bg-surface/90 backdrop-blur-md border-b border-subtle flex items-center justify-between px-3 select-none z-30 transition-colors" dir={dir}>
      {/* Left Group: Single Authoritative Brand Logo */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-lg bg-pale-sky-500/10 border border-pale-sky-500/30 flex items-center justify-center text-pale-sky-500">
            <BookOpen className="w-4 h-4" />
          </div>
          <HeaderBotanicalAccent />
          <span className="font-display text-base font-bold text-main tracking-wide">{t('brand')}</span>
        </div>
      </div>

      {/* Center Group: Global Search & Command Center (Cmd + K) */}
      <div className="flex-1 max-w-lg mx-4">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:border-pale-sky-500/50 hover:text-main transition-all group shadow-inner text-xs"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted group-hover:text-pale-sky-500 transition-colors" />
            <span className="font-sans">
              {t('searchPlaceholder')}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono bg-surface border border-subtle px-1.5 py-0.5 rounded text-muted">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Right Group: Action Controls & Theme */}
      <div className="flex items-center gap-1.5">
        {/* Zen Mode Button */}
        <button
          onClick={toggleZenMode}
          title={t('toggleZenMode')}
          className={`p-1.5 rounded-lg transition-all ${isZenMode
            ? 'bg-pale-sky-500 text-white shadow-md shadow-pale-sky-500/20'
            : 'text-muted hover:text-main hover:bg-canvas'
            }`}
        >
          <Eye className="w-4 h-4" />
        </button>

        {/* Language Switcher (AR / EN) */}
        <button
          onClick={toggleLanguage}
          title={t('toggleLanguage')}
          className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-canvas transition-colors flex items-center gap-1 text-xs font-bold font-sans"
        >
          <Globe className="w-4 h-4" />
          <span className="uppercase text-[10px]">{lang === 'ar' ? 'EN' : 'AR'}</span>
        </button>

        {/* Theme Switcher */}
        <button
          onClick={toggleTheme}
          title={t('toggleTheme')}
          className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-canvas transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-pale-sky-700" />}
        </button>
      </div>
    </header>
  );
};
