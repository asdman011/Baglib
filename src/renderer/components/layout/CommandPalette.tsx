'use client';
import { SHORTCUTS, shortcutHint } from '../actions/shortcuts';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  BookOpen,
  FileText,
  ArrowRight,
  X,
  Globe,
  LayoutDashboard,
  CalendarDays,
  Library,
  Layers,
  Clapperboard,
  Route,
  BookMarked,
  BookOpenText,
  Feather,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useWorkspace, type WorkspaceViewMode } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { matchesStudyQuery } from '../../../shared/study-notes';
import { openStudyNote } from '../../utils/study-navigation';

interface CommandItem {
  shortcut?: string;
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const {
    toggleNavPinned,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setSearchHubOpen,
    openBookForReading,
    setViewMode,
    books,
    t,
    dir,
  } = useWorkspace();
  const { notes } = useStudyNotes();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const scope = /^\/(notes|books|workspaces)\b\s*/iu.exec(query)?.[1]?.toLowerCase();
  const keyword = query.replace(/^\/(notes|books|workspaces)\b\s*/iu, '').trim();

  useEffect(() => {
    if (!isCommandPaletteOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCommandPaletteOpen(false);
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
      if (previous?.isConnected) previous.focus();
    };
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  const results = useMemo(() => {
    const workspaces: { id: WorkspaceViewMode; titleKey: Parameters<typeof t>[0]; groupKey: Parameters<typeof t>[0]; icon: LucideIcon }[] = [
      { id: 'dashboard', titleKey: 'navDashboard', groupKey: 'navHomeGroup', icon: LayoutDashboard },
      { id: 'planner', titleKey: 'plannerTitle', groupKey: 'navHomeGroup', icon: CalendarDays },
      { id: 'library', titleKey: 'navLibrary', groupKey: 'navLibraryGroup', icon: Library },
      { id: 'categories', titleKey: 'navCategories', groupKey: 'navLibraryGroup', icon: Layers },
      { id: 'lectures', titleKey: 'lecturesTitle', groupKey: 'navLibraryGroup', icon: Clapperboard },
      { id: 'notes', titleKey: 'navNotes', groupKey: 'navNotesGroup', icon: FileText },
      { id: 'pathways', titleKey: 'pathwaysTitle', groupKey: 'navResearchGroup', icon: Route },
      { id: 'quran', titleKey: 'navQuran', groupKey: 'navIslamicGroup', icon: BookMarked },
      { id: 'sunnah', titleKey: 'navSunnah', groupKey: 'navIslamicGroup', icon: BookOpenText },
      { id: 'bayan', titleKey: 'navBayan', groupKey: 'navIslamicGroup', icon: Feather },
      { id: 'settings', titleKey: 'navSettings', groupKey: 'breadcrumbSystem', icon: Settings },
    ];

    const items: CommandItem[] = [];
    if(!scope) {
      for(const shortcut of SHORTCUTS.filter(entry=>['help','new-note','navigation'].includes(entry.id))) {
        const title=t(shortcut.labelKey);
        if(keyword && !matchesStudyQuery(title,keyword))continue;
        items.push({id:'shortcut:'+shortcut.id,title,subtitle:t('readerShortcutsTitle'),shortcut:shortcutHint(shortcut.id),icon:FileText,action:()=>{
          if(shortcut.id==='help')window.dispatchEvent(new CustomEvent('baglib:shortcut-help'));
          if(shortcut.id==='new-note')openStudyNote({content:''});
          if(shortcut.id==='navigation')toggleNavPinned();
        }});
      }
    }

    // 1. Workspace navigation commands
    if (scope !== 'notes' && scope !== 'books') {
      for (const ws of workspaces) {
        const title = t(ws.titleKey);
        const group = t(ws.groupKey);
        if (!keyword || matchesStudyQuery(`${title} ${group}`, keyword)) {
          items.push({
            id: `ws:${ws.id}`,
            title,
            subtitle: group,
            icon: ws.icon,
            action: () => setViewMode(ws.id),
          });
        }
      }
    }

    // 2. Books search
    if (scope !== 'notes' && scope !== 'workspaces') {
      for (const book of books) {
        if (matchesStudyQuery(`${book.title} ${book.author}`, keyword)) {
          items.push({
            id: `book:${book.id}`,
            title: book.title,
            subtitle: book.author,
            icon: BookOpen,
            action: () => openBookForReading(book),
          });
        }
      }
    }

    // 3. Notes search
    if (scope !== 'books' && scope !== 'workspaces') {
      for (const note of notes) {
        if (matchesStudyQuery(`${note.title} ${note.content} ${note.aliases.join(' ')} ${note.tags.join(' ')}`, keyword)) {
          items.push({
            id: `note:${note.id}`,
            title: note.title || note.content.slice(0, 70),
            subtitle: note.aliases.join(' · ') || t('navNotes'),
            icon: FileText,
            action: () => openStudyNote({ id: note.id }),
          });
        }
      }
    }

    // 4. Global Discovery Hub fallback
    if (!scope && keyword) {
      items.push({
        id: 'discovery',
        title: t('studyOnlineSearch', { query: keyword }),
        subtitle: t('navDiscoveryHub'),
        icon: Globe,
        action: () => setSearchHubOpen(true),
      });
    }

    return items.slice(0, 20);
  }, [books, notes, scope, keyword, t, openBookForReading, setSearchHubOpen, setViewMode, toggleNavPinned]);

  if (!isCommandPaletteOpen) return null;

  const choose = (index: number) => {
    results[index]?.action();
    setCommandPaletteOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-16 p-3"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setCommandPaletteOpen(false);
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('navSearch')}
        dir={dir}
        className="w-full max-w-2xl rounded-2xl border border-subtle bg-surface shadow-xl overflow-hidden"
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('input,button') || [])];
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-subtle p-4">
          <Search size={19} className="text-muted shrink-0" />
          <input
            ref={input}
            type="search"
            value={query}
            aria-label={t('studyCommandSearch')}
            placeholder={t('studyCommandSearch')}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) =>
                  (index + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(1, results.length)) %
                  Math.max(1, results.length)
                );
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                choose(active);
              }
            }}
            className="flex-1 min-w-0 bg-transparent outline-none text-sm leading-loose text-main font-sans"
          />
          <button
            type="button"
            aria-label={t('studyClose')}
            onClick={() => setCommandPaletteOpen(false)}
            className="p-1 rounded text-muted hover:text-main focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {results.map((item, index) => {
            const Icon = item.icon;
            const isSelected = index === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => choose(index)}
                onMouseEnter={() => setActive(index)}
                className={`w-full flex items-center gap-3 text-start rounded-xl p-3 transition-colors ${
                  isSelected
                    ? 'bg-primary/15 text-primary-text ring-1 ring-inset ring-primary-text/30'
                    : 'hover:bg-canvas text-main'
                }`}
              >
                <Icon size={18} className={`shrink-0 ${isSelected ? 'text-primary-text' : 'text-muted'}`} />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate font-bold text-sm leading-relaxed">
                    {item.title}
                  </span>
                  <span dir="auto" className="block truncate text-xs text-muted leading-relaxed">
                    {item.subtitle}
                  </span>
                </span>
                {item.shortcut && <kbd dir="ltr" className="text-[10px] text-muted">{item.shortcut}</kbd>}
                <ArrowRight size={16} className="rtl:rotate-180 shrink-0 text-muted" />
              </button>
            );
          })}
          {!results.length && (
            <p className="text-center p-6 text-muted text-sm">{t('studyNoResults')}</p>
          )}
        </div>
        <p className="px-4 py-2.5 border-t border-subtle text-xs text-muted" dir="ltr">
          /workspaces · /books · /notes
        </p>
      </div>
    </div>
  );
};
