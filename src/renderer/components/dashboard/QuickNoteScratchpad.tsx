'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Heading2, Quote, List, Code, Eye, Link, Save } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { StudyLinkPicker } from '../notes/StudyLinkPicker';
import { StudyNoteContent } from '../notes/StudyNoteContent';
import type { StudyNote } from '../../../shared/study-notes';
import { studyNoteHeading } from '../../../shared/study-notes';
import type { TranslationKey } from '../../translations';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';

const DRAFT_KEY = 'dashboard.scratchpad.draft.v1';
export function detectTextDirection(text: string, fallback: 'rtl' | 'ltr' = 'rtl'): 'rtl' | 'ltr' {
  for (const ch of text.trim()) {
    if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(ch)) return 'rtl';
    if (/[A-Za-z]/u.test(ch)) return 'ltr';
  }
  return fallback;
}

export const QuickNoteScratchpad: React.FC<{ initialNote?: StudyNote; initialContent?: string; onSaved?: () => void }> = ({ initialNote, initialContent, onSaved }) => {
  const { books, dir, t, refreshTags, openBookForReading } = useWorkspace();
  const draftKey = initialContent !== undefined ? 'study.capture.draft.v1' : DRAFT_KEY;
  const { notes } = useStudyNotes();
  const [title, setTitle] = useState(initialNote?.title || '');
  const [content, setContent] = useState(initialNote?.content || initialContent || '');
  const [tagsInput, setTagsInput] = useState(initialNote?.tags.join(', ') || '');
  const [aliasesInput, setAliasesInput] = useState(initialNote?.aliases.join(', ') || '');
  const [workId, setWorkId] = useState(initialNote?.workId || '');
  const [preview, setPreview] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [ready, setReady] = useState(!!initialNote);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<TranslationKey | null>(null);
  const [draftStatus, setDraftStatus] = useState<TranslationKey | null>(null);
  const [direction, setDirection] = useState<'auto' | 'rtl' | 'ltr'>('auto');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const noteId = useRef(initialNote?.id);
  const savingRef = useRef(false);
  const pendingDraft = useRef<{ key: string; value: object } | null>(null);
  const effectiveDir = direction === 'auto' ? detectTextDirection(content, dir) : direction;
  const clear = () => { setTitle(''); setContent(''); setTagsInput(''); setAliasesInput(''); setWorkId(''); setPreview(false); };

  useEffect(() => {
    let alive = true;
    if (initialNote) return;
    void (async () => {
      const saved = await window.electronAPI?.settings?.get(draftKey);
      if (!alive) return;
      if (saved && typeof saved === 'object') {
        const draft = saved as { title?: string; content?: string; tagsInput?: string; aliasesInput?: string; workId?: string };
        setTitle(draft.title || ''); setContent(initialContent && !draft.content?.includes(initialContent.trim()) ? [draft.content, initialContent].filter(Boolean).join('\n\n') : draft.content || initialContent || ''); setTagsInput(draft.tagsInput || ''); setAliasesInput(draft.aliasesInput || ''); setWorkId(draft.workId || '');
      }
    })().catch(() => { if (alive) setDraftStatus('studySaveFailed'); }).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [initialNote, initialContent, draftKey]);

  useEffect(() => {
    return () => {
      const draft = pendingDraft.current;
      if (draft) void window.electronAPI?.settings?.set(draft.key, draft.value).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!ready || initialNote || saving) return;
    let alive = true;
    const value = { title, content, tagsInput, aliasesInput, workId, updatedAt: new Date().toISOString() };
    pendingDraft.current = { key: draftKey, value };
    const timer = setTimeout(() => {
      const api = window.electronAPI?.settings;
      if (!api?.set) return;
      void api.set(draftKey, value)
        .then(() => { if (alive) setDraftStatus('dashScratchpadAutoSaved'); })
        .catch(() => { if (alive) setDraftStatus('studySaveFailed'); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [ready, initialNote, title, content, tagsInput, aliasesInput, workId, draftKey, saving]);

  const insert = (prefix: string, suffix = '') => {
    const el = textarea.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    setContent(`${content.slice(0, start)}${prefix}${content.slice(start, end)}${suffix}${content.slice(end)}`);
    setPreview(false);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(start + prefix.length, start + prefix.length + end - start); });
  };
  const save = async () => {
    if (!content.trim() || savingRef.current) return;
    savingRef.current = true; setSaving(true); setStatus(null);
    try {
      const api = window.electronAPI;
      if (!api?.studyNotes?.save) throw new Error('desktop-required');
      const split = (value: string) => [...new Set(value.split(/[,،]/u).map(value => value.trim()).filter(Boolean))];
      const id = noteId.current || crypto.randomUUID();
      noteId.current = id;
      const note = { id, title: title.trim() || studyNoteHeading(content), content: content.trim(), aliases: split(aliasesInput), tags: split(tagsInput), workId: workId || undefined };
      // Keep existing book notes visible in their reader, with link metadata in private settings.
      if (workId || initialNote?.knowledgeId) {
        if (!api.knowledge?.save) throw new Error('desktop-required');
        const existing = initialNote ? (await (workId ? api.knowledge.getByWork(workId, 'note') : api.knowledge.getAll())).find((item: { id: string }) => item.id === (initialNote.knowledgeId || id)) : undefined;
        const tagIds: string[] = [];
        for (const tag of note.tags) { const saved = await api.tags.create(tag); if (saved?.id) tagIds.push(saved.id); }
        await api.knowledge.save({ id, workId: workId || null, editionId: existing?.editionId, sourceId: existing?.sourceId, knowledgeType: 'note', location: existing?.location || '1', createdAt: existing?.createdAt, noteContent: note.content, tagIds });
      }
      await api.studyNotes.save(note);
      if (!initialNote) { await api.settings.set(draftKey, { content: '', title: '', tagsInput: '', aliasesInput: '', workId: '' }); pendingDraft.current = null; clear(); noteId.current = undefined; }
      void refreshTags();
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      setStatus('dashScratchpadSavedToast'); onSaved?.();
    } catch { setStatus('studySaveFailed'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const tools = [[Bold, 'studyBold', '**', '**'], [Italic, 'studyItalic', '*', '*'], [Heading2, 'studyHeading', '## ', ''], [Quote, 'studyQuote', '> ', ''], [List, 'studyList', '- ', ''], [Code, 'studyCode', '`', '`']] as const;
  return <section data-dashboard-module="quick-note-scratchpad" aria-label={t('dashScratchpadTitle')} className="rounded-2xl border border-subtle bg-surface p-4 space-y-3 min-w-0">
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display font-bold leading-relaxed">{t('dashScratchpadTitle')}</h2><span data-scratchpad-autosave-status className="text-xs text-muted" role="status">{draftStatus && t(draftStatus)}</span></header>
    <input disabled={!ready || saving} aria-label={t('studyNoteTitle')} placeholder={t('studyNoteTitle')} maxLength={300} value={title} onChange={event => setTitle(event.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-3 py-2 text-sm" dir="auto" />
    <div className="flex flex-wrap items-center gap-1 border-b border-subtle pb-2">
      {tools.map(([Icon, label, prefix, suffix]) => <button type="button" key={label} title={t(label)} aria-label={t(label)} className="p-2 rounded hover:bg-canvas" onClick={() => insert(prefix, suffix)}><Icon size={14} /></button>)}
      <button type="button" aria-label={t('studyInsertLink')} title={t('studyInsertLink')} aria-expanded={linksOpen} onClick={() => setLinksOpen(value => !value)} className="p-2 rounded hover:bg-canvas"><Link size={14} /></button>
      <button type="button" data-scratchpad-dir-toggle onClick={() => setDirection(value => value === 'auto' ? 'rtl' : value === 'rtl' ? 'ltr' : 'auto')} className="text-xs p-2">{direction === 'auto' ? t('dashScratchpadDirAuto', { dir: effectiveDir.toUpperCase() }) : direction.toUpperCase()}</button>
      <button type="button" onClick={() => setPreview(value => !value)} className="ms-auto text-xs inline-flex items-center gap-1 p-2"><Eye size={14} />{t(preview ? 'dashScratchpadEdit' : 'dashScratchpadPreview')}</button>
    </div>
    {linksOpen && <StudyLinkPicker notes={notes} onInsert={text => { insert(text); setLinksOpen(false); }} />}
    {preview ? <div data-scratchpad-preview className="min-h-32 max-h-72 overflow-auto rounded-lg border border-subtle p-3"><StudyNoteContent content={content} notes={notes} t={t} onOpen={target => { void navigateStudyReference(target, books, openBookForReading, id => openStudyNote({ id })).catch(() => setStatus('studySourceUnavailable')); }} /></div> : <textarea disabled={!ready || saving} ref={textarea} data-scratchpad-textarea aria-label={t('dashScratchpadTitle')} value={content} onChange={event => setContent(event.target.value)} placeholder={t('dashScratchpadPlaceholder')} rows={5} dir={effectiveDir} className="w-full rounded-lg border border-subtle bg-canvas p-3 text-sm leading-loose resize-y" />}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input data-scratchpad-tags aria-label={t('dashScratchpadTagsPlaceholder')} value={tagsInput} onChange={event => setTagsInput(event.target.value)} placeholder={t('dashScratchpadTagsPlaceholder')} className="rounded-lg border border-subtle bg-canvas px-3 py-2 text-xs min-w-0" />
      <input aria-label={t('studyAliases')} value={aliasesInput} onChange={event => setAliasesInput(event.target.value)} placeholder={t('studyAliases')} className="rounded-lg border border-subtle bg-canvas px-3 py-2 text-xs min-w-0" />
    </div>
    <select aria-label={t('dashScratchpadAttachBook')} value={workId} disabled={!!initialNote?.workId || !!initialNote?.knowledgeId} onChange={event => setWorkId(event.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-3 py-2 text-xs"><option value="">{t('dashScratchpadGeneralNote')}</option>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
    {status && <p role={status === 'studySaveFailed' ? 'alert' : 'status'} className="text-xs leading-relaxed">{t(status)}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" data-scratchpad-save disabled={!ready || !content.trim() || saving} onClick={() => void save()} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 text-white px-4 py-2 text-sm disabled:opacity-40"><Save size={15} />{t('dashScratchpadSaveToKb')}</button><button type="button" data-scratchpad-clear onClick={clear} className="rounded-lg border border-subtle px-3 py-2 text-xs">{t('dashScratchpadClear')}</button></div>
  </section>;
};
