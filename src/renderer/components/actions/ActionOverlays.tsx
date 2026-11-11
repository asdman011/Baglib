'use client';
import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { PersonalCommentary } from '../knowledge/PersonalCommentary';
import { Modal } from '../ui/Modal';
import { matchesShortcut } from './shortcuts';
import { ShortcutList } from './ShortcutList';
import { openStudyNote } from '../../utils/study-navigation';
import { studyLinkText } from '../../../shared/study-notes';
import type { StudyNote } from '../../../shared/study-notes';
export function ActionOverlays() {
    const { t, viewMode } = useWorkspace();
    const [comment, setComment] = useState<string | null>(null);
    const [help, setHelp] = useState(false);
    const [status, setStatus] = useState<'studyActionFailed' | 'ctxActionDone' | null>(null);
    const [link, setLink] = useState<{
        target: string;
        label: string;
    } | null>(null);
    const [notes, setNotes] = useState<StudyNote[]>([]);
    useEffect(() => {
        const key = (event: KeyboardEvent) => { if (matchesShortcut(event, 'help', viewMode)) {
            event.preventDefault();
            setHelp(true);
        } };
        const show = () => setHelp(true);
        const showComment = (event: Event) => setComment((event as CustomEvent<string>).detail);
        const failed = () => setStatus('studyActionFailed');
        const done = () => setStatus('ctxActionDone');
        const choose = (event: Event) => {
            setLink((event as CustomEvent).detail);
            void window.electronAPI.studyNotes.list().then(setNotes).catch(failed);
        };
        window.addEventListener('baglib:personal-commentary', showComment);
        window.addEventListener('keydown', key);
        window.addEventListener('baglib:shortcut-help', show);
        window.addEventListener('baglib:action-failed', failed);
        window.addEventListener('baglib:context-action-done', done);
        window.addEventListener('baglib:link-passage', choose);
        return () => { window.removeEventListener('baglib:personal-commentary', showComment); window.removeEventListener('keydown', key); window.removeEventListener('baglib:shortcut-help', show); window.removeEventListener('baglib:action-failed', failed); window.removeEventListener('baglib:context-action-done', done); window.removeEventListener('baglib:link-passage', choose); };
    }, [viewMode]);
    useEffect(() => { if (!status)
        return; const timer = setTimeout(() => setStatus(null), 4000); return () => clearTimeout(timer); }, [status]);
    const attach = async (note: StudyNote) => {
        if (!link)
            return;
        try {
            await window.electronAPI.studyNotes.save({ ...note, expectedRevision: note.revision, content: `${note.content}\n\n${studyLinkText(link.target, link.label)}` });
            window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
            openStudyNote({ id: note.id });
            setLink(null);
        }
        catch {
            setStatus('studyActionFailed');
        }
    };
    return <>
    <Modal open={!!comment} onClose={() => setComment(null)} title={t('commentaryTitle')}>
      {comment && <div ref={node => { const details = node?.querySelector('details'); if (details)
        details.open = true; }}><PersonalCommentary key={comment} reference={comment}/></div>}
    </Modal>
    <Modal open={help} onClose={() => setHelp(false)} title={t('keyboardShortcutsTitle')}>
      <p className="mb-3 text-sm leading-relaxed">{t('ctxShortcutTip')}</p>
      <ShortcutList t={t} />
    </Modal>
    <Modal open={!!link} onClose={() => setLink(null)} title={t('ctxChooseNote')}>
      <div className="space-y-2">{notes.map(note => <button key={note.id} type="button" className="block w-full rounded-lg border border-border p-3 text-start" onClick={() => void attach(note)}>{note.title || note.content.slice(0, 80)}</button>)}{!notes.length && <button type="button" onClick={() => { if (link)
        openStudyNote({ content: studyLinkText(link.target, link.label) }); setLink(null); }}>{t('studyNewNote')}</button>}</div>
    </Modal>
    {status && <p role="status" className="fixed bottom-4 inset-x-4 z-[210] mx-auto w-fit rounded-xl border border-border bg-surface p-3 text-sm text-text shadow-lg">{t(status)}</p>}
  </>;
}
