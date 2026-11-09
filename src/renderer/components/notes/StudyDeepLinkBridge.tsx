'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { parseNoteTarget, validStudyTarget } from '../../../shared/study-notes';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';

/** Mounted for the full workspace lifetime, including before lazy views load. */
export function StudyDeepLinkBridge() {
  const { openBookForReading, t } = useWorkspace();
  const [missing, setMissing] = useState(false);
  const [sourceMissing, setSourceMissing] = useState(false);
  useEffect(() => {
    const show = () => setSourceMissing(true);
    window.addEventListener('baglib:study-source-missing', show);
    return () => window.removeEventListener('baglib:study-source-missing', show);
  }, []);
  useEffect(() => {
    if (!sourceMissing) return;
    const timer = setTimeout(() => setSourceMissing(false), 8000);
    return () => clearTimeout(timer);
  }, [sourceMissing]);
  const navigation = useRef(Promise.resolve());
  useEffect(() => window.electronAPI?.onStudyNavigate?.(target => {
    navigation.current = navigation.current.then(async () => {
      setMissing(false);
      setSourceMissing(false);
      if (!validStudyTarget(target)) throw new Error('invalid-reference');
      const note = parseNoteTarget(target);
      if (note) {
        const [personal, knowledge] = await Promise.all([window.electronAPI.studyNotes.list(), window.electronAPI.knowledge.getAll()]);
        if (!personal.some(item => item.id === note.id) && !knowledge.some((item: KnowledgeItemDTO) => item.id === note.id && ['note', 'study_note', 'reading_reflection'].includes(item.knowledgeType))) throw new Error('missing-note');
      }
      // Read fresh data, so a cold-start link does not race WorkspaceContext's initial fetch.
      const books = target.startsWith('book:') ? await window.electronAPI.getAllBooks() : [];
      await navigateStudyReference(target, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor }));
    }).catch(() => setMissing(true));
  }), [openBookForReading]);
  return missing || sourceMissing ? <p role="alert" data-study-link-missing className="absolute top-12 inset-x-3 z-[100] rounded-xl border border-amber-500/40 bg-surface p-3 text-sm leading-loose break-words">{t(sourceMissing ? 'studyLinkFileMissing' : 'studyLinkTargetMissing')}</p> : null;
}
