'use client';
import React, { useEffect, useState } from 'react';
import { Clock, Link2, NotebookPen, Quote, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { QuickNoteScratchpad } from '../dashboard/QuickNoteScratchpad';
import { companionContext, insertIntoCompanion, onCompanionContextChange, type CompanionContext } from '../../utils/companion-context';
import { studyLinkText } from '../../../shared/study-notes';
import { clockTime } from '../../../shared/lectures';

const STORAGE = 'baglib.companion.v1';
const PANE_WIDTH = 'min(380px, 45vw)';
interface Saved { open: boolean; noteId: string | null; stamp: boolean }
function read(): Saved {
  try { const value = JSON.parse(localStorage.getItem(STORAGE) || '{}') as Partial<Saved>; return { open: value.open === true, noteId: typeof value.noteId === 'string' ? value.noteId : null, stamp: value.stamp !== false }; }
  catch { return { open: false, noteId: null, stamp: true }; }
}
function write(value: Saved) { try { localStorage.setItem(STORAGE, JSON.stringify(value)); } catch { /* a convenience only */ } }

/** The selected text inside the main view, if any (not text selected inside the pane itself). */
function mainSelection(): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return '';
  const node = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
  if (node?.closest('[data-companion-pane]')) return '';
  return selection.toString().trim();
}

/** Toggle for the companion pane, shown at the end edge of the views that have one. */
export function CompanionToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useWorkspace();
  if (open) return null;
  // Fixed, so it stays reachable above the full-window book reader too.
  return <button type="button" data-companion-toggle aria-label={t('companionOpen')} title={t('companionOpen')} onClick={onToggle}
    className="fixed end-0 top-1/2 z-[60] -translate-y-1/2 flex items-center gap-1 rounded-s-xl border border-e-0 border-subtle bg-surface/95 px-2 py-2 text-xs shadow-md hover:bg-canvas">
    <NotebookPen size={14} aria-hidden="true" /><span className="hidden md:inline">{t('companionTitle')}</span>
  </button>;
}

/**
 * A note that stays open beside the reader, Quran, Sunnah, poetry and lectures while you move between them
 * (decision S10). It can take the selected text with a link back to where it was read, a link to the current
 * place, and, during a lecture, start each new line with the playback time.
 */
export function CompanionNotePane({ onClose, overlay = false }: { onClose: () => void; overlay?: boolean }) {
  const { t, viewMode } = useWorkspace();
  const { notes } = useStudyNotes();
  const [state, setState] = useState<Saved>(read);
  const [context, setContext] = useState<CompanionContext | null>(() => companionContext(viewMode));
  useEffect(() => {
    const refresh = () => setContext(companionContext(viewMode));
    // The view on screen may have registered before this pane subscribed; read it once, after this render.
    const frame = requestAnimationFrame(refresh);
    const off = onCompanionContextChange(refresh);
    return () => { cancelAnimationFrame(frame); off(); };
  }, [viewMode]);
  // A lecture's place moves with playback; keep the shown time current.
  useEffect(() => {
    if (context?.kind !== 'lecture') return;
    const timer = setInterval(() => setContext(companionContext(viewMode)), 1000);
    return () => clearInterval(timer);
  }, [context?.kind, viewMode]);
  const update = (next: Partial<Saved>) => setState(previous => { const value = { ...previous, ...next }; write(value); return value; });
  const note = state.noteId ? notes.find(item => item.id === state.noteId) : undefined;
  // Read the place at the moment of use, from the view on screen: a lecture's time moves on while the pane stays open.
  const here = () => companionContext(viewMode);
  const linkHere = () => { const place = here(); if (place) insertIntoCompanion(`${studyLinkText(place.target, place.label)} `); };
  const sendSelection = () => {
    const text = mainSelection();
    const place = here();
    if (!text) return;
    const quote = text.split(/\r?\n/u).map(line => `> ${line}`).join('\n');
    insertIntoCompanion(`${quote}${place ? ` ${studyLinkText(place.target, place.label)}` : ''}\n\n`);
  };
  const lecture = context?.kind === 'lecture';
  const lineStamp = () => {
    if (!state.stamp) return null;
    const place = companionContext(viewMode);
    if (!place || place.kind !== 'lecture') return null;
    const seconds = Number(place.target.split(':')[2]) || 0;
    return `${studyLinkText(place.target, clockTime(seconds))} `;
  };
  // Over the full-window book reader the pane is fixed at the end edge, and the reader narrows by its width.
  useEffect(() => {
    if (!overlay) return;
    document.documentElement.style.setProperty('--companion-width', PANE_WIDTH);
    return () => { document.documentElement.style.removeProperty('--companion-width'); };
  }, [overlay]);
  return <aside data-companion-pane aria-label={t('companionTitle')} style={{ width: PANE_WIDTH }} className={`shrink-0 border-s border-subtle bg-canvas flex flex-col min-h-0 ${overlay ? 'fixed inset-y-0 end-0 z-[60] shadow-2xl' : ''}`}>
    <header className="flex items-center gap-2 border-b border-subtle px-3 py-2">
      <NotebookPen size={16} aria-hidden="true" />
      <h2 className="text-sm font-bold">{t('companionTitle')}</h2>
      <button type="button" aria-label={t('companionClose')} title={t('companionClose')} onClick={onClose} className="ms-auto rounded p-1 hover:bg-surface"><X size={16} /></button>
    </header>
    <div className="space-y-2 border-b border-subtle px-3 py-2 text-xs">
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-muted">{t('companionNote')}</span>
        <select data-companion-note aria-label={t('companionNote')} value={state.noteId ?? ''} onChange={event => update({ noteId: event.target.value || null })} className="min-w-0 flex-1 rounded border border-subtle bg-surface px-2 py-1">
          <option value="">{t('companionNewNote')}</option>
          {notes.map(item => <option key={item.id} value={item.id}>{item.title || item.content.slice(0, 60)}</option>)}
        </select>
      </label>
      <p data-companion-place className="truncate text-muted" dir="auto">{context ? `${t('companionHere')}: ${context.label}` : t('companionNoPlace')}</p>
      <div className="flex flex-wrap gap-2">
        {/* mousedown is prevented so the selection in the reader is still there when the click arrives */}
        <button type="button" data-companion-quote onMouseDown={event => event.preventDefault()} onClick={sendSelection} className="inline-flex items-center gap-1 rounded border border-subtle px-2 py-1 hover:bg-surface"><Quote size={12} aria-hidden="true" />{t('companionQuote')}</button>
        <button type="button" data-companion-link disabled={!context} onMouseDown={event => event.preventDefault()} onClick={linkHere} className="inline-flex items-center gap-1 rounded border border-subtle px-2 py-1 hover:bg-surface disabled:opacity-40"><Link2 size={12} aria-hidden="true" />{t('companionLinkHere')}</button>
      </div>
      {lecture && <label className="flex items-center gap-2"><input type="checkbox" data-companion-stamp checked={state.stamp} onChange={event => update({ stamp: event.target.checked })} /><Clock size={12} aria-hidden="true" />{t('companionStamp')}</label>}
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <QuickNoteScratchpad
        // Remount when the note or its revision changes, so the next save uses the current revision.
        key={`${state.noteId ?? 'draft'}:${note?.revision ?? 'none'}`}
        initialNote={note}
        draftKey="companion.draft.v1"
        companion
        lineStamp={lecture ? lineStamp : undefined}
        onSaved={saved => { if (saved) update({ noteId: saved.id }); }}
      />
    </div>
  </aside>;
}

export function useCompanionPane() {
  const [open, setOpen] = useState(() => read().open);
  const set = (value: boolean) => { setOpen(value); write({ ...read(), open: value }); };
  return { open, toggle: () => set(!open), close: () => set(false) };
}
