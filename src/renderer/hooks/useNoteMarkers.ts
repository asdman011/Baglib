'use client';
import { useEffect, useState } from 'react';
import { markerCounts } from '../../shared/note-targets';

/**
 * KEY-337: how many notes sit on each passage (bookmarks are not notes), for the small markers beside the text.
 * Reads the notes itself so readers can use it without the workspace provider; refreshes when notes change.
 */
export function useNoteMarkers(): Map<string, number> {
  const [counts, setCounts] = useState<Map<string, number>>(() => new Map());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const api = typeof window === 'undefined' ? undefined : window.electronAPI;
      if (!api?.studyNotes) return;
      const [notes, knowledge] = await Promise.all([
        api.studyNotes.list().catch(() => []),
        Promise.resolve(api.knowledge?.getAll?.() ?? []).catch(() => []),
      ]);
      if (!alive) return;
      const seen = new Set(notes.map(note => note.id));
      const all = [
        ...notes.filter(note => !note.tags.includes('bookmark')),
        ...(Array.isArray(knowledge) ? knowledge : [])
          .filter(item => ['note', 'study_note', 'reading_reflection'].includes(item.knowledgeType) && typeof item.noteContent === 'string' && !seen.has(item.id))
          .map(item => ({ id: item.id, content: item.noteContent as string, sourceRef: item.location })),
      ];
      setCounts(markerCounts(all));
    };
    void load();
    const update = () => void load();
    window.addEventListener('baglib:notes-changed', update);
    const unsubscribe = window.electronAPI?.studyNotes?.onChanged?.(update);
    return () => { alive = false; window.removeEventListener('baglib:notes-changed', update); unsubscribe?.(); };
  }, []);
  return counts;
}
