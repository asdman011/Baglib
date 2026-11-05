'use client';

import { KnowledgeGraphButton } from '../notes/KnowledgeGraph';
import React, { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Heading2, Quote, List, Code, Eye, Link, Save } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { StudyLinkPicker } from '../notes/StudyLinkPicker';
import { StudyNoteContent } from '../notes/StudyNoteContent';
import { StudyNoteEditor, type StudyNoteEditorHandle } from '../notes/StudyNoteEditor';
import { calculateHijriDate } from '../../../shared/athan-calculator';
import { searchCorpus } from '../../utils/corpus-lookup';
import { cardsFromLine } from '../../../shared/note-cards';
import { anchorParagraph } from '../../../shared/note-paragraphs';
import { HONORIFICS_SETTING } from '../../../shared/honorifics';
import { COMPANION_INSERT } from '../../utils/companion-context';
import { collectionKeys } from '../../utils/sunnah-collections';
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

export const QuickNoteScratchpad: React.FC<{
  initialNote?: StudyNote; initialContent?: string; onSaved?: (note?: StudyNote) => void; autoFocus?: boolean;
  /** A draft of its own, so the companion pane does not share the dashboard's draft. */
  draftKey?: string;
  /** In the companion pane: accept text sent from the open reader (selection, link to the current place). */
  companion?: boolean;
  /** Text to start each new line with, e.g. the lecture time while a lecture plays. */
  lineStamp?: () => string | null;
}> = ({ initialNote, initialContent, onSaved, autoFocus, draftKey: ownDraftKey, companion, lineStamp }) => {
  const { books, dir, t, lang, refreshTags, openBookForReading } = useWorkspace();
  const slashLabels = { link: t('slashLink'), card: t('slashCard'), quran: t('slashQuran'), hadith: t('slashHadith'), poem: t('slashPoem'), heading: t('studyHeading'), quote: t('studyQuote'), list: t('studyList'), date: t('slashDate'), salla: t('slashSalla'), azza: t('slashAzza'), subhanahu: t('slashSubhanahu'), radiyaHu: t('slashRadiyaHu'), radiyaHa: t('slashRadiyaHa'), rahimahu: t('slashRahimahu') };
  const draftKey = ownDraftKey ?? (initialContent !== undefined ? 'study.capture.draft.v1' : DRAFT_KEY);
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
  const [cardMessage, setCardMessage] = useState<string | null>(null);
  // Honorific expansion is on unless the user turned it off (decision S1).
  const [honorificsOn, setHonorificsOn] = useState(true);
  useEffect(() => {
    let alive = true;
    window.electronAPI?.settings?.get(HONORIFICS_SETTING).then(value => { if (alive && value === false) setHonorificsOn(false); }, () => {});
    return () => { alive = false; };
  }, []);
  const toggleHonorifics = () => { const next = !honorificsOn; setHonorificsOn(next); void window.electronAPI?.settings?.set(HONORIFICS_SETTING, next).catch(() => {}); };
  const [draftStatus, setDraftStatus] = useState<TranslationKey | null>(null);
  const [direction, setDirection] = useState<'auto' | 'rtl' | 'ltr'>('auto');
  const editor = useRef<StudyNoteEditorHandle>(null);
  // The editor reports changes outside React events, so Save reads the newest text from here, not a stale render.
  const contentRef = useRef(content);
  useEffect(() => { contentRef.current = content; }, [content]);
  const changeContent = (value: string) => { contentRef.current = value; setContent(value); };
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

  useEffect(() => {
    if (!companion) return;
    const receive = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      if (typeof text !== 'string' || !text) return;
      if (editor.current && !preview) editor.current.insert(text, '', { spaced: true });
      else changeContent(`${contentRef.current}${contentRef.current && !contentRef.current.endsWith('\n') ? '\n' : ''}${text}`);
    };
    window.addEventListener(COMPANION_INSERT, receive);
    return () => window.removeEventListener(COMPANION_INSERT, receive);
  }, [companion, preview]);
  const insert = (prefix: string, suffix = '') => {
    if (preview || !editor.current) { setContent(value => `${value}${prefix}${suffix}`); setPreview(false); return; }
    editor.current.insert(prefix, suffix);
  };
  // `/card`: each card is saved and queued for review; the note keeps its text, so the card stays traceable to it.
  // A paragraph link to a paragraph without an anchor: add ` ^id` to that paragraph in its note, through the
  // normal save path with its revision, so history records it and a concurrent edit is refused, not overwritten.
  const anchorParagraphIn = async (id: string, start: number, anchor: string) => {
    const target = notes.find(note => note.id === id);
    try {
      if (!target) throw new Error('missing-note');
      const updated = anchorParagraph(target.content, start, anchor);
      if (updated.content === target.content) return;
      await window.electronAPI.studyNotes.save({ id: target.id, title: target.title, content: updated.content, aliases: target.aliases, tags: target.tags, workId: target.workId, expectedRevision: target.revision ?? 0 });
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
    } catch { setCardMessage(t('studyParagraphAnchorFailed')); }
  };
  const makeCards = async (line: string, nextLine: string | null): Promise<boolean> => {
    const cards = cardsFromLine(line, nextLine);
    if (!cards.length) { setCardMessage(t('cardNeedsFormat')); return false; }
    try {
      for (const card of cards) {
        const saved = await window.electronAPI.knowledgeCards.save({ ...card, sourceKind: 'note', sourceRef: noteId.current ? `note:${noteId.current}` : undefined, sourceLabel: title.trim() || undefined, workId: workId || undefined });
        await window.electronAPI.knowledgeCards.setMemorizing(saved.id, true);
      }
      window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
      const form = new Intl.PluralRules(lang).select(cards.length);
      setCardMessage(t(form === 'one' ? 'cardsCreatedOne' : form === 'two' ? 'cardsCreatedTwo' : form === 'few' ? 'cardsCreatedFew' : 'cardsCreatedOther', { count: cards.length }));
      return true;
    } catch { setCardMessage(t('studySaveFailed')); return false; }
  };
  const save = async () => {
    const content = contentRef.current;
    if (!content.trim() || savingRef.current) return;
    savingRef.current = true; setSaving(true); setStatus(null);
    try {
      const api = window.electronAPI;
      if (!api?.studyNotes?.save) throw new Error('desktop-required');
      const split = (value: string) => [...new Set(value.split(/[,،]/u).map(value => value.trim()).filter(Boolean))];
      const id = noteId.current || crypto.randomUUID();
      noteId.current = id;
      const note = { id, title: title.trim() || studyNoteHeading(content), content, aliases: split(aliasesInput), tags: split(tagsInput), workId: workId || undefined,expectedRevision:initialNote?.revision ?? 0 };
      const saved = await api.studyNotes.save(note);
      if (!initialNote) { await api.settings.set(draftKey, { content: '', title: '', tagsInput: '', aliasesInput: '', workId: '' }); pendingDraft.current = null; clear(); noteId.current = undefined; }
      void refreshTags();
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
      setStatus('dashScratchpadSavedToast'); onSaved?.(saved);
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
      {initialNote && <KnowledgeGraphButton noteId={initialNote.id} notes={notes} />}<button type="button" data-honorifics-toggle aria-pressed={honorificsOn} title={t(honorificsOn ? 'honorificsOnHint' : 'honorificsOffHint')} aria-label={t(honorificsOn ? 'honorificsOnHint' : 'honorificsOffHint')} onClick={toggleHonorifics} className={`rounded px-2 py-0.5 text-2xl leading-none ${honorificsOn ? 'bg-amber-500/15' : 'text-muted line-through'}`}>ﷺ</button><button type="button" data-scratchpad-dir-toggle onClick={() => setDirection(value => value === 'auto' ? 'rtl' : value === 'rtl' ? 'ltr' : 'auto')} className="text-xs p-2">{direction === 'auto' ? t('dashScratchpadDirAuto', { dir: effectiveDir.toUpperCase() }) : direction.toUpperCase()}</button>
      <button type="button" onClick={() => setPreview(value => !value)} className="ms-auto text-xs inline-flex items-center gap-1 p-2"><Eye size={14} />{t(preview ? 'dashScratchpadEdit' : 'dashScratchpadPreview')}</button>
    </div>
    {linksOpen && <StudyLinkPicker notes={notes} onInsert={text => { insert(text); setLinksOpen(false); }} />}
    {preview ? <div data-scratchpad-preview className="min-h-32 max-h-72 overflow-auto rounded-lg border border-subtle p-3"><StudyNoteContent content={content} notes={notes} t={t} onOpen={target => { void navigateStudyReference(target, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(() => setStatus('studySourceUnavailable')); }} /></div> : <StudyNoteEditor ref={editor} disabled={!ready || saving} ariaLabel={t('dashScratchpadTitle')} placeholder={t('dashScratchpadPlaceholder')} value={content} onChange={changeContent} dir={effectiveDir} notes={notes} books={books} kindLabels={{ note: t('studyLinkKindNote'), book: t('studyLinkKindBook'), quran: t('studyLinkKindAyah'), hadith: t('studyLinkKindHadith'), poem: t('studyLinkKindPoem'), paragraph: t('studyLinkKindParagraph') }} currentNoteId={initialNote?.id} onAnchorParagraph={anchorParagraphIn} searchCorpus={(kinds, query) => searchCorpus(kinds, query, id => t(collectionKeys[id]))} autoFocus={autoFocus} onMakeCards={makeCards} expandHonorifics={honorificsOn} newLinePrefix={lineStamp} slashLabels={slashLabels} dateText={() => { const today = new Date(); const hijri = calculateHijriDate(today); return `${today.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'long' })} — ${lang === 'ar' ? hijri.formattedAr : hijri.formattedEn}`; }} onSave={() => void save()} />}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <input data-scratchpad-tags aria-label={t('dashScratchpadTagsPlaceholder')} value={tagsInput} onChange={event => setTagsInput(event.target.value)} placeholder={t('dashScratchpadTagsPlaceholder')} className="rounded-lg border border-subtle bg-canvas px-3 py-2 text-xs min-w-0" />
      <input aria-label={t('studyAliases')} value={aliasesInput} onChange={event => setAliasesInput(event.target.value)} placeholder={t('studyAliases')} className="rounded-lg border border-subtle bg-canvas px-3 py-2 text-xs min-w-0" />
    </div>
    <select aria-label={t('dashScratchpadAttachBook')} value={workId} disabled={!!initialNote?.workId || !!initialNote?.knowledgeId} onChange={event => setWorkId(event.target.value)} className="w-full rounded-lg border border-subtle bg-canvas px-3 py-2 text-xs"><option value="">{t('dashScratchpadGeneralNote')}</option>{books.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}</select>
    {status && <p role={status === 'studySaveFailed' ? 'alert' : 'status'} className="text-xs leading-relaxed">{t(status)}</p>}
    {cardMessage && <p role="status" data-card-message className="text-xs leading-relaxed">{cardMessage}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" data-scratchpad-save disabled={!ready || !content.trim() || saving} onClick={() => void save()} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 text-white px-4 py-2 text-sm disabled:opacity-40"><Save size={15} />{t('dashScratchpadSaveToKb')}</button><button type="button" data-scratchpad-clear onClick={clear} className="rounded-lg border border-subtle px-3 py-2 text-xs">{t('dashScratchpadClear')}</button></div>
  </section>;
};
