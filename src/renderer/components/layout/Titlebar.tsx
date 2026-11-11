'use client';

import React from 'react';
import {
  Search,
  Moon,
  Sun,
  Globe,
  Command,
  Eye,
  ChevronRight,
  Menu as MenuIcon,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SunnahSearch, type SunnahSearchTarget } from '../sunnah/SunnahSearch';
import { QuranSearchDialog } from '../quran/QuranSearchDialog';
import { openQuranAyah } from '../../utils/quran-navigation';
import { resolveBreadcrumbs } from './nav-model';

export const Titlebar: React.FC = () => {
  const [sunnahSearch, setSunnahSearch] = React.useState(false);
  const [quranSearch, setQuranSearch] = React.useState(false);
  const [sunnahQuery, setSunnahQuery] = React.useState('');
  const sunnahDialog = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    if (sunnahSearch) sunnahDialog.current?.showModal();
  }, [sunnahSearch]);

  const {
    dir,
    theme,
    lang,
    isZenMode,
    toggleZenMode,
    toggleLanguage,
    toggleTheme,
    setCommandPaletteOpen,
    viewMode,
    setViewMode,
    activeBook,
    activeLibraryCategory,
    toggleMobileNav,
    isNavPinned,
    toggleNavPinned,
    openNavPeek,
    scheduleCloseNavPeek,
    t,
  } = useWorkspace();

  const breadcrumbs = resolveBreadcrumbs(viewMode, {
    activeBookTitle: activeBook?.title,
    activeCategoryName: activeLibraryCategory !== 'ALL' ? activeLibraryCategory : undefined,
  });

  const parentText = breadcrumbs.parent.labelKey ? t(breadcrumbs.parent.labelKey) : '';
  const currentText = breadcrumbs.current.labelKey
    ? t(breadcrumbs.current.labelKey)
    : breadcrumbs.current.rawText || '';

  return (
    <header
      className="h-12 shrink-0 bg-surface/90 backdrop-blur-md border-b border-subtle flex items-center justify-between gap-1 sm:gap-2 px-2 sm:px-3 select-none z-30 transition-colors"
      dir={dir}
    >
      {/* Start Group: Responsive Menu Trigger (at 480px) & Workspace Breadcrumb */}
      <div className="flex items-center gap-1 sm:gap-2 min-w-0 shrink-0 max-w-[45%] sm:max-w-xs md:max-w-sm">
        {/* Mobile / Narrow Screen Drawer Menu Button */}
        <button
          type="button"
          onClick={toggleMobileNav}
          aria-label={t('mobileNavOpen')}
          title={t('mobileNavOpen')}
          className="md:hidden p-1.5 rounded-lg text-muted hover:text-main hover:bg-canvas transition-colors focus-visible:outline-2 focus-visible:outline-focus cursor-pointer shrink-0"
        >
          <MenuIcon className="w-4 h-4" />
        </button>

        {/* Desktop Pin-or-Peek Menu Button (KEY-310) */}
        <button
          type="button"
          onClick={toggleNavPinned}
          onMouseEnter={() => {
            if (!isNavPinned) openNavPeek();
          }}
          onMouseLeave={() => {
            if (!isNavPinned) scheduleCloseNavPeek();
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !isNavPinned) {
              e.preventDefault();
              openNavPeek();
            }
          }}
          aria-label={isNavPinned ? t('navUnpinSidebar') : t('navPinSidebar')}
          aria-pressed={isNavPinned}
          title={isNavPinned ? `${t('navUnpinSidebar')} (Ctrl+B)` : `${t('navPinSidebar')} (Ctrl+B)`}
          data-nav-menu-button
          className={`hidden md:flex p-1.5 rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-focus cursor-pointer shrink-0 ${
            isNavPinned
              ? 'text-primary-text bg-primary/10 hover:bg-primary/20'
              : 'text-muted hover:text-main hover:bg-canvas'
          }`}
        >
          <MenuIcon className="w-4 h-4" />
        </button>

        {/* Breadcrumb Navigation */}
        <nav aria-label={t('titlebarBreadcrumbs')} className="flex items-center gap-1 text-xs min-w-0">
          {breadcrumbs.parent.viewMode ? (
            <button
              type="button"
              onClick={() => {
                if (breadcrumbs.parent.viewMode) setViewMode(breadcrumbs.parent.viewMode);
              }}
              className="font-medium text-muted hover:text-primary-text transition-colors truncate max-w-[80px] sm:max-w-[120px] focus-visible:outline-2 focus-visible:outline-focus rounded px-0.5"
            >
              {parentText}
            </button>
          ) : (
            <span className="font-medium text-muted truncate max-w-[80px] sm:max-w-[120px]">
              {parentText}
            </span>
          )}

          <ChevronRight className="w-3 h-3 text-muted/60 shrink-0 rtl:rotate-180" aria-hidden="true" />

          <span
            dir="auto"
            className="font-bold text-main truncate max-w-[90px] sm:max-w-[150px] md:max-w-[180px]"
            title={currentText}
          >
            {currentText}
          </span>
        </nav>
      </div>

      {/* Center Group: Global Search & Command Center (Cmd + K) */}
      <div className="flex-1 max-w-lg mx-1 sm:mx-3 flex items-center gap-1 sm:gap-2 min-w-0">
        <button
          type="button"
          onClick={() => {
            setSunnahSearch(false);
            setQuranSearch(true);
          }}
          className="hidden sm:inline-flex shrink-0 text-xs px-2 py-1.5 rounded-lg border border-subtle text-muted hover:text-main hover:bg-canvas transition-colors"
          title={t('quranGlobalSearch')}
          aria-label={t('quranGlobalSearch')}
        >
          {t('navQuran')}
        </button>
        <button
          type="button"
          onClick={() => setSunnahSearch(true)}
          className="hidden sm:inline-flex shrink-0 text-xs px-2 py-1.5 rounded-lg border border-subtle text-muted hover:text-main hover:bg-canvas transition-colors"
          title={t('sunnahSearchAll')}
          aria-label={t('sunnahSearchAll')}
        >
          {t('navSunnah')}
        </button>
        <div className="flex-1 min-w-8 flex items-center justify-between px-2 sm:px-3 py-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:border-focus/50 hover:text-main transition-all group shadow-inner text-xs cursor-pointer">
          <button
            type="button"
            aria-label={t('studyCommandSearch')}
            onClick={() => setCommandPaletteOpen(true)}
            className="flex flex-1 items-center gap-2 text-start min-w-0"
          >
            <Search className="w-3.5 h-3.5 text-muted group-hover:text-focus transition-colors shrink-0" />
            <span className="hidden md:inline font-sans truncate leading-relaxed">
              {t('searchPlaceholder')}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCommandPaletteOpen(true);
            }}
            title={t('studyCommandSearch')}
            aria-label={t('studyCommandSearch')}
            className="hidden sm:flex shrink-0 items-center gap-1 text-[10px] font-mono bg-surface hover:bg-canvas border border-subtle px-1.5 py-0.5 rounded text-muted hover:text-main transition-colors"
          >
            <Command className="w-3 h-3" />
            <span>K</span>
          </button>
        </div>
      </div>

      {quranSearch && (
        <QuranSearchDialog
          onClose={() => setQuranSearch(false)}
          onSetup={() => {
            setViewMode('quran');
            setQuranSearch(false);
          }}
          onOpen={(target) => {
            setViewMode('quran');
            openQuranAyah(target);
            setQuranSearch(false);
          }}
        />
      )}
      {sunnahSearch && (
        <dialog
          ref={sunnahDialog}
          onCancel={() => setSunnahSearch(false)}
          className="m-auto bg-transparent text-main p-4 w-full max-w-3xl backdrop:bg-black/50"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t('sunnahSearchAll')}
            className="bg-surface rounded-xl border border-subtle w-full max-w-3xl max-h-[85vh] overflow-auto p-4"
          >
            <div className="flex gap-3 items-center">
              <input
                autoFocus
                type="search"
                className="flex-1 min-w-0 p-3 bg-canvas border border-subtle rounded-lg"
                value={sunnahQuery}
                onChange={(event) => setSunnahQuery(event.target.value)}
                placeholder={t('sunnahSearchAll')}
                aria-label={t('sunnahSearchAll')}
              />
              <button type="button" onClick={() => setSunnahSearch(false)}>{t('sunnahClose')}</button>
            </div>
            <SunnahSearch
              query={sunnahQuery}
              scope="all"
              t={t}
              onOpen={(target: SunnahSearchTarget) => {
                try {
                  const previous = JSON.parse(localStorage.getItem('baglib:sunnah:position:v1') || '{}');
                  localStorage.setItem(
                    'baglib:sunnah:position:v1',
                    JSON.stringify({ ...previous, ...target, mode: 'single' })
                  );
                } catch {}
                setViewMode('sunnah');
                window.dispatchEvent(new CustomEvent('baglib:sunnah-open', { detail: target }));
                setSunnahSearch(false);
              }}
            />
          </section>
        </dialog>
      )}

      {/* Far Side (End Group): Action Controls & Theme */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        {/* Zen Mode Button */}
        <button
          type="button"
          onClick={toggleZenMode}
          title={t('toggleZenMode')}
          aria-label={t('toggleZenMode')}
          className={`p-1.5 rounded-lg transition-all ${
            isZenMode
              ? 'bg-primary text-primary-contrast shadow-md shadow-primary/20'
              : 'text-muted hover:text-main hover:bg-canvas'
          }`}
        >
          <Eye className="w-4 h-4" />
        </button>

        {/* Language Switcher (AR / EN) */}
        <button
          type="button"
          onClick={toggleLanguage}
          title={t('toggleLanguage')}
          aria-label={t('toggleLanguage')}
          className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-canvas transition-colors flex items-center gap-1 text-xs font-bold font-sans"
        >
          <Globe className="w-4 h-4" />
          <span className="uppercase text-[10px]">{lang === 'ar' ? 'EN' : 'AR'}</span>
        </button>

        {/* Theme Switcher */}
        <button
          type="button"
          onClick={toggleTheme}
          title={t('toggleTheme')}
          aria-label={t('toggleTheme')}
          className="p-1.5 rounded-lg text-muted hover:text-main hover:bg-canvas transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-accent" /> : <Moon className="w-4 h-4 text-focus" />}
        </button>
      </div>
    </header>
  );
};
