'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StudyNote } from '../../shared/study-notes';
import { studyNoteHeading } from '../../shared/study-notes';
import type { KnowledgeItemDTO } from '../../shared/types/knowledge';
import { useWorkspace } from '../components/context/WorkspaceContext';

export function useStudyNotes() {
  const { bookNotes } = useWorkspace();
  const [saved, setSaved] = useState<StudyNote[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItemDTO[]>([]);
  const [failedSources, setFailedSources] = useState<('notes' | 'knowledge')[]>([]);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const [loadedKnowledge,setLoadedKnowledge] = useState(false);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    const [personal, existing] = await Promise.allSettled([
      Promise.resolve().then(() => window.electronAPI?.studyNotes?.list() ?? []),
      Promise.resolve().then(() => window.electronAPI?.knowledge?.getAll?.() ?? []),
    ]);
    if (current !== generation.current) return;
    const failures: ('notes' | 'knowledge')[] = [];
    if (personal.status === 'fulfilled') setSaved(personal.value);
    else failures.push('notes');
    if (existing.status === 'fulfilled') {
      setKnowledge(Array.isArray(existing.value) ? existing.value : []);
      setLoadedKnowledge(Boolean(window.electronAPI?.knowledge?.getAll));
    } else failures.push('knowledge');
    setFailedSources(failures);
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const unsubscribe = window.electronAPI?.studyNotes?.onChanged(() => void refresh());
    const update = () => void refresh();
    window.addEventListener('baglib:notes-changed', update);
    return () => { invalidate(); clearTimeout(timer); unsubscribe?.(); window.removeEventListener('baglib:notes-changed', update); };
  }, [refresh, invalidate]);
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
  return { notes, refresh, error: failedSources.length > 0, failedSources, loading };
}
