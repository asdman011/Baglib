'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudyNote } from '../../shared/study-notes';
import { studyNoteHeading } from '../../shared/study-notes';
import type { KnowledgeItemDTO } from '../../shared/types/knowledge';
import { useWorkspace } from '../components/context/WorkspaceContext';

export function useStudyNotes() {
  const { bookNotes } = useWorkspace();
  const [saved, setSaved] = useState<StudyNote[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItemDTO[]>([]);
  const [error, setError] = useState(false);
  const [loadedKnowledge,setLoadedKnowledge] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const api = window.electronAPI?.studyNotes;
      const [personal, existing] = await Promise.all([api ? api.list() : Promise.resolve([]), window.electronAPI?.knowledge?.getAll?.() || Promise.resolve([])]);
      setSaved(personal);
      setKnowledge(Array.isArray(existing) ? existing : []);
      setLoadedKnowledge(Boolean(window.electronAPI?.knowledge?.getAll));
      setError(false);
    } catch { setError(true); }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const unsubscribe = window.electronAPI?.studyNotes?.onChanged(() => void refresh());
    const update = () => void refresh();
    window.addEventListener('baglib:notes-changed', update);
    return () => { clearTimeout(timer); unsubscribe?.(); window.removeEventListener('baglib:notes-changed', update); };
  }, [refresh]);
  const notes = useMemo(() => {
    const all = new Map<string, StudyNote>();
    if (!loadedKnowledge) for (const note of bookNotes) all.set(note.id, { id: note.id, title: studyNoteHeading(note.content), content: note.content, aliases: [], tags: [], workId: note.bookId, createdAt: note.createdAt, updatedAt: note.createdAt });
    for (const item of knowledge) if (['note','study_note','reading_reflection'].includes(item.knowledgeType) && typeof item.noteContent === 'string') all.set(item.id, { id: item.id, knowledgeId: item.id, revision:item.revision,title: item.title || studyNoteHeading(item.noteContent), content: item.noteContent, aliases: [], tags: item.tags?.map(tag => tag.name) || [], workId: item.workId || undefined, createdAt: item.createdAt, updatedAt: item.updatedAt });
    for (const item of knowledge) { const note=all.get(item.id);if(note){note.kind=item.knowledgeType;note.sourceRef=item.location;} }
    for (const note of saved) {
      const canonical = all.get(note.id);
      all.set(note.id, canonical ? { ...note,kind:canonical.kind, knowledgeId: canonical.knowledgeId, content: canonical.content, tags: canonical.tags, updatedAt: canonical.updatedAt } : note);
    }
    return [...all.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [bookNotes, saved, knowledge,loadedKnowledge]);
  return { notes, refresh, error };
}
