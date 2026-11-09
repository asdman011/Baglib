'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { parseNoteTarget, validStudyTarget } from '../../../shared/study-notes';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';

/** Mounted for the full workspace lifetime, including before lazy views load. */
export function StudyDeepLinkBridge() {
  const { openBookForReading, setReadingPage, t } = useWorkspace();
  const [missing, setMissing] = useState(false);
  const navigation = useRef(Promise.resolve());
  useEffect(() => window.electronAPI?.onStudyNavigate?.(target => {
    navigation.current = navigation.current.then(async () => {
      setMissing(false);
      if (!validStudyTarget(target)) throw new Error('invalid-reference');
      const note = parseNoteTarget(target);
      if (note) {
        const [personal, knowledge] = await Promise.all([window.electronAPI.studyNotes.list(), window.electronAPI.knowledge.getAll()]);
        if (!personal.some(item => item.id === note.id) && !knowledge.some((item: KnowledgeItemDTO) => item.id === note.id && ['note', 'study_note', 'reading_reflection'].includes(item.knowledgeType))) throw new Error('missing-note');
      }
      // Read fresh data, so a cold-start link does not race WorkspaceContext's initial fetch.
      const books = target.startsWith('book:') ? await window.electronAPI.getAllBooks() : [];
      await navigateStudyReference(target, books, book => {
        openBookForReading(book);
        // Also handles another page of the book already open (the reader stays mounted).
        const page = /#p=(\d+)$/u.exec(target);
        if (page) setReadingPage(+page[1]);
      }, (id, anchor) => openStudyNote({ id, anchor }));
    }).catch(() => setMissing(true));
  }), [openBookForReading, setReadingPage]);
  return missing ? <p role="alert" data-study-link-missing className="absolute top-12 inset-x-3 z-[100] rounded-xl border border-amber-500/40 bg-surface p-3 text-sm leading-loose break-words">{t('studyLinkTargetMissing')}</p> : null;
}
