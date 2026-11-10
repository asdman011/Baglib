'use client';
import React, { useEffect, useId, useReducer, useRef } from 'react';
import { BookOpen, Languages, NotebookPen, PanelRight, Settings2, Sparkles, Volume2, X } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import { readerChromeState, type ReaderTab } from './reader-chrome';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;
export function IslamicReaderHeader({ title, picker, profile, settings, panelOpen, onPanelToggle, t }: {
  title: string; picker: React.ReactNode; profile?: React.ReactNode; settings: React.ReactNode;
  panelOpen: boolean; onPanelToggle: () => void; t: Translate;
}) {
  const [state, dispatch] = useReducer(readerChromeState, { settings: false, panel: false, tab: 'commentary' });
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!state.settings) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) dispatch({ type:'close' }); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); dispatch({ type:'close' }); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [state.settings]);
  return <header ref={root} data-islamic-reader-header className="relative z-30 shrink-0 border-b border-subtle bg-surface px-3 py-2">
    <div className="flex min-w-0 items-center gap-2">
      <span className="sr-only">{title}</span>
      <div data-reader-picker className="flex min-w-0 flex-1 flex-wrap items-center gap-2 [&_select]:min-w-0 [&_select]:max-w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-subtle [&_select]:bg-canvas [&_select]:px-2 [&_select]:py-2 [&_select]:text-sm [&_select]:leading-relaxed">{picker}</div>
      {profile && <div className="shrink-0 [&_select]:max-w-28 [&_select]:rounded-lg [&_select]:border [&_select]:border-subtle [&_select]:bg-canvas [&_select]:p-2 [&_select]:text-sm">{profile}</div>}
      <button ref={trigger} type="button" data-reader-settings aria-label={t('quranReadingOptions')} title={t('quranReadingOptions')} aria-expanded={state.settings} aria-controls={id} onClick={() => { if (panelOpen) onPanelToggle(); dispatch({ type:'settings' }); }} className="shrink-0 rounded-lg p-2 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-primary"><Settings2 size={18} /></button>
      <button type="button" data-reader-panel-toggle aria-label={t('islamicStudyPanel')} title={t('islamicStudyPanel')} aria-expanded={panelOpen} onClick={() => { dispatch({ type:'close' }); onPanelToggle(); }} className="shrink-0 rounded-lg p-2 hover:bg-canvas focus-visible:outline-2 focus-visible:outline-primary"><PanelRight size={18} className="rtl:rotate-180" /></button>
    </div>
    <div id={id} hidden={!state.settings} data-reader-settings-popover className="absolute end-3 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[65dvh] overflow-auto overscroll-contain rounded-2xl border border-subtle bg-surface p-4 text-sm leading-loose shadow-xl [&_button]:rounded-lg [&_button]:border [&_button]:border-subtle [&_button]:px-3 [&_button]:py-2 [&_label]:leading-loose">{settings}</div>
  </header>;
}
const tabIcons = { commentary: BookOpen, translation: Languages, notes: NotebookPen, related: Sparkles, recitation: Volume2 };
const tabLabels = { commentary: 'islamicCommentary', translation: 'quranCatTranslation', notes: 'navNotesLog', related: 'islamicRelated', recitation: 'quranCatRecitation' } as const;
export function IslamicReaderPanel({ active, onTab, onClose, children, t, recitation = false }: {
  active: ReaderTab; onTab: (tab: ReaderTab) => void; onClose: () => void; children: React.ReactNode; t: Translate; recitation?: boolean;
}) {
  const id = useId();
  const tabs: ReaderTab[] = recitation ? ['commentary','translation','notes','related','recitation'] : ['commentary','translation','notes','related'];
  return <aside data-islamic-reader-panel aria-label={t('islamicStudyPanel')} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }} className="absolute inset-y-3 end-5 z-30 flex w-[min(25rem,calc(100%-2.5rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-subtle bg-surface shadow-xl">
    <div className="flex items-start border-b border-subtle p-2">
      <div role="tablist" aria-label={t('islamicStudyPanel')} className="grid min-w-0 flex-1 grid-cols-2 gap-1 sm:grid-cols-4" onKeyDown={event => {
        if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')];
        const direction = event.currentTarget.closest('[dir]')?.getAttribute('dir') === 'rtl' ? -1 : 1;
        const delta = (event.key === 'ArrowRight' ? 1 : -1) * direction;
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (buttons.indexOf(document.activeElement as HTMLButtonElement) + delta + buttons.length) % buttons.length;
        buttons[index].click(); buttons[index].focus();
      }}>
        {tabs.map(tab => { const Icon = tabIcons[tab]; return <button key={tab} id={`${id}-${tab}`} role="tab" type="button" aria-selected={active === tab} aria-controls={`${id}-body`} tabIndex={active === tab ? 0 : -1} onClick={() => onTab(tab)} className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] leading-relaxed text-muted aria-selected:bg-primary/10 aria-selected:text-primary-text focus-visible:outline-2 focus-visible:outline-primary"><Icon size={16} />{t(tabLabels[tab])}</button>; })}
      </div>
      <button type="button" aria-label={t('quranClosePanel')} onClick={onClose} className="rounded-lg p-2"><X size={16} /></button>
    </div>
    <div role="tabpanel" id={`${id}-body`} aria-labelledby={`${id}-${active}`} tabIndex={0} className="min-h-0 flex-1 overflow-y-auto overscroll-contain break-words p-4 leading-loose [scrollbar-gutter:stable]">{children}</div>
  </aside>;
}
