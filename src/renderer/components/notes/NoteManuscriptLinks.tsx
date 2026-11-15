'use client';
/** KEY-372 (RE-11): a note's "Used in manuscripts", read from manuscript_link, plus "Embed in manuscript". */
import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { groupBacklinks, noteTarget, type ManuscriptBacklink } from '../../../shared/manuscript-notes';
import { createNoteEmbedPayload, requestOpenManuscriptDocument, requestSendToManuscript } from '../../../shared/manuscript-transfer';
import type { StudyNote } from '../../../shared/study-notes';

export function NoteManuscriptLinks({ note }: { note: StudyNote }) {
  const { t } = useWorkspace();
  const [links, setLinks] = useState<ManuscriptBacklink[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => {
      const api = window.electronAPI?.manuscripts;
      if (!api?.backlinks) { setLinks([]); return; }
      void api.backlinks(noteTarget(note.id))
        .then(rows => { if (live) setLinks(groupBacklinks(rows)); })
        .catch(() => { if (live) setLinks([]); });
    };
    load();
    window.addEventListener('baglib:manuscript-document-changed', load);
    window.addEventListener('focus', load);
    return () => { live = false; window.removeEventListener('baglib:manuscript-document-changed', load); window.removeEventListener('focus', load); };
  }, [note.id]);
  const count = links.reduce((sum, item) => sum + item.chapters.length, 0);
  return <section data-note-manuscripts className="space-y-2.5 border-t border-subtle/80 pt-4">
    <div className="flex items-center justify-between">
      <h4 className="font-bold text-main flex items-center gap-1.5"><FileText className="size-3.5 text-primary-text" /><span>{t('notesUsedInManuscripts')}</span></h4>
      <span className="text-muted tabular-nums text-[11px]">{count}</span>
    </div>
    {count === 0 ? <p className="text-muted text-[11px] py-1">{t('notesNotInManuscripts')}</p> : <ul className="space-y-1.5">
      {links.flatMap(item => item.chapters.map(chapter => <li key={chapter.documentId}>
        <button type="button" dir="auto" data-note-manuscript-chapter={chapter.documentId} onClick={() => requestOpenManuscriptDocument(chapter.documentId)} className="w-full text-start p-2 rounded-lg bg-canvas hover:bg-canvas/80 border border-subtle transition-colors block">
          <span className="block font-medium text-main truncate">{chapter.documentTitle}</span>
          <span className="block text-[11px] text-muted truncate mt-0.5">{item.manuscriptTitle}</span>
        </button>
      </li>))}
    </ul>}
    <button type="button" data-note-embed-in-manuscript onClick={() => requestSendToManuscript(createNoteEmbedPayload(note))} className="w-full rounded-lg border border-subtle px-3 py-2 text-xs hover:bg-canvas">{t('notesEmbedInManuscript')}</button>
  </section>;
}
