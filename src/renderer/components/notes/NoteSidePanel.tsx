'use client';
/**
 * KEY-337: write a note beside the text. Opening a note from an ayah, a hadith, a verse or a lecture moment shows this
 * panel on the inline-end side instead of switching to the Notes tab, so the reading position is never lost.
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { StickyNote, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { studyLinkText, studyNoteExcerpt, studyNoteHeading } from '../../../shared/study-notes';
import { notesForTarget } from '../../../shared/note-targets';
import { openStudyNote } from '../../utils/study-navigation';
import { NOTE_PANEL_EVENT, type NotePanelRequest } from '../actions/passage-actions';

export function NoteSidePanel() {
  const [request, setRequest] = useState<NotePanelRequest | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const open = (event: Event) => {
      opener.current = document.activeElement as HTMLElement | null;
      setRequest({ ...(event as CustomEvent<NotePanelRequest>).detail });
    };
    window.addEventListener(NOTE_PANEL_EVENT, open);
    return () => window.removeEventListener(NOTE_PANEL_EVENT, open);
  }, []);
  if (!request) return null;
  const close = () => {
    setRequest(null);
    if (opener.current?.isConnected) opener.current.focus();
  };
  return <NotePanelBody key={`${request.target}|${request.text ?? ''}`} request={request} onClose={close} />;
}

function NotePanelBody({ request, onClose }: { request: NotePanelRequest; onClose: () => void }) {
  const { t, dir, lang } = useWorkspace();
  const { notes, loading } = useStudyNotes();
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'saved' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const existing = notesForTarget(notes.filter(note => !note.tags.includes('bookmark')), request.target);
  useEffect(() => { editor.current?.focus(); }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const content = () => [studyLinkText(request.target, request.label, request.embed), request.text?.trim(), draft.trim()].filter(Boolean).join('\n\n');
  const save = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const text = content();
      await window.electronAPI.studyNotes.save({ title: studyNoteHeading(draft) || request.label, content: text, aliases: [], tags: [] });
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      setDraft('');
      setStatus('saved');
      editor.current?.focus();
    } catch {
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  };
  const date = (value: string) => { try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium' }).format(new Date(value)); } catch { return ''; } };
  return <aside role="dialog" aria-modal="false" aria-labelledby={titleId} dir={dir} data-note-side-panel data-note-target={request.target}
    className="fixed top-0 bottom-0 end-0 z-[150] flex w-[min(26rem,100vw)] flex-col border-s border-border bg-surface text-text shadow-2xl">
    <header className="flex items-start gap-2 border-b border-border/70 p-4">
      <StickyNote className="mt-1 size-4 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="text-sm font-bold leading-relaxed">{t('notePanelTitle')}</h2>
        <p className="truncate text-xs leading-relaxed text-text-muted"><bdi>{request.label}</bdi></p>
      </div>
      <button type="button" onClick={onClose} aria-label={t('close')} title={t('close')} className="rounded-lg p-1.5 text-text-muted hover:bg-canvas hover:text-text focus-visible:outline-2 focus-visible:outline-focus"><X className="size-4" aria-hidden="true" /></button>
    </header>
    <div className="space-y-2 p-4">
      {request.text?.trim() && <blockquote dir="auto" data-note-panel-quote className="max-h-28 overflow-y-auto border-s-2 border-amber-500 ps-3 font-reading text-base leading-loose text-text-muted">{request.text.trim()}</blockquote>}
      <textarea ref={editor} data-note-panel-editor value={draft} dir="auto" rows={6} maxLength={20000} placeholder={t('notePanelPlaceholder')} aria-label={t('notePanelTitle')}
        onChange={event => { setDraft(event.target.value); setStatus(null); }}
        onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(); } }}
        className="w-full resize-y rounded-xl border border-border bg-canvas p-3 text-sm leading-loose focus-visible:outline-2 focus-visible:outline-focus" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-note-panel-save disabled={!draft.trim() || busy} onClick={() => void save()} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-contrast disabled:opacity-50">{t('notePanelSave')}</button>
        <button type="button" data-note-panel-open-notes onClick={() => { openStudyNote({ content: content() + (draft.trim() ? '' : '\n\n') }); onClose(); }} className="rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-canvas hover:text-text">{t('notePanelOpenInNotes')}</button>
        {status && <p role={status === 'failed' ? 'alert' : 'status'} className={`text-xs ${status === 'failed' ? 'text-danger' : 'text-text-muted'}`}>{t(status === 'failed' ? 'studyActionFailed' : 'notePanelSaved')}</p>}
      </div>
    </div>
    <section aria-label={t('notePanelExisting')} className="min-h-0 flex-1 overflow-y-auto border-t border-border/70 p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{t('notePanelExisting')}</h3>
      {!loading && !existing.length && <p className="text-sm leading-relaxed text-text-muted">{t('notePanelEmpty')}</p>}
      <ul className="space-y-2" data-note-panel-list>
        {existing.map(note => <li key={note.id} className="rounded-xl border border-border/70 bg-canvas p-3">
          <p dir="auto" className="text-sm leading-relaxed">{studyNoteExcerpt(note.content, 220) || note.title}</p>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-text-muted">
            <span>{date(note.updatedAt)}</span>
            <button type="button" onClick={() => { openStudyNote({ id: note.id }); onClose(); }} className="rounded-md px-2 py-0.5 hover:bg-surface hover:text-text">{t('notePanelOpenNote')}</button>
          </div>
        </li>)}
      </ul>
    </section>
  </aside>;
}
