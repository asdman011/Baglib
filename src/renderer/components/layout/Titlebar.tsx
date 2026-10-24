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
import { SunnahSearch, type SunnahSearchTarget } from '../sunnah/SunnahSearch';

export const Titlebar: React.FC = () => {
  const [sunnahSearch, setSunnahSearch] = React.useState(false);
  const [sunnahQuery, setSunnahQuery] = React.useState('');
  const sunnahDialog = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => { if (sunnahSearch) sunnahDialog.current?.showModal(); }, [sunnahSearch]);
  const {
    dir,
    theme,
    lang,
    isZenMode,
    toggleZenMode,
    toggleLanguage,
    toggleTheme,
    setCommandPaletteOpen,
    setSearchHubOpen,
    setViewMode,
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
          <span className="font-display text-base font-bold text-main tracking-wide">{t('brand')}</span>
        </div>
      </div>

      {/* Center Group: Global Search & Command Center (Cmd + K) */}
      <div className="flex-1 max-w-lg mx-4 flex items-center gap-2 min-w-0">
        <button type="button" onClick={() => setSunnahSearch(true)} className="shrink-0 text-xs p-2 rounded-lg border border-subtle" title={t('sunnahSearchAll')}>{t('navSunnah')}</button>
        <div
          onClick={() => setSearchHubOpen(true)}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:border-pale-sky-500/50 hover:text-main transition-all group shadow-inner text-xs cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted group-hover:text-pale-sky-500 transition-colors" />
            <span className="font-sans">
              {t('searchPlaceholder')}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCommandPaletteOpen(true);
            }}
            title="Command Palette (Cmd + K)"
            className="flex items-center gap-1 text-[10px] font-mono bg-surface hover:bg-canvas border border-subtle px-1.5 py-0.5 rounded text-muted hover:text-main transition-colors"
          >
            <Command className="w-3 h-3" />
            <span>K</span>
          </button>
        </div>
      </div>

      {sunnahSearch && <dialog ref={sunnahDialog} onCancel={() => setSunnahSearch(false)} className="m-auto bg-transparent text-main p-4 w-full max-w-3xl backdrop:bg-black/50">
        <section role="dialog" aria-modal="true" aria-label={t('sunnahSearchAll')} className="bg-surface rounded-xl border border-subtle w-full max-w-3xl max-h-[85vh] overflow-auto p-4">
          <div className="flex gap-3 items-center"><input autoFocus type="search" className="flex-1 min-w-0 p-3 bg-canvas border border-subtle rounded-lg" value={sunnahQuery} onChange={event => setSunnahQuery(event.target.value)} placeholder={t('sunnahSearchAll')} aria-label={t('sunnahSearchAll')} /><button onClick={() => setSunnahSearch(false)}>{t('sunnahClose')}</button></div>
          <SunnahSearch query={sunnahQuery} scope="all" t={t} onOpen={(target: SunnahSearchTarget) => {
            try { const previous = JSON.parse(localStorage.getItem('baglib:sunnah:position:v1') || '{}'); localStorage.setItem('baglib:sunnah:position:v1', JSON.stringify({ ...previous, ...target, mode: 'single' })); } catch {}
            setViewMode('sunnah'); window.dispatchEvent(new CustomEvent('baglib:sunnah-open', { detail: target })); setSunnahSearch(false);
          }} />
        </section>
      </dialog>}
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
