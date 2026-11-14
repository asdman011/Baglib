'use client';
import { useEffect, useMemo, useState } from 'react';
import type { StudyNote } from '../../shared/study-notes';
import { quranBookmarks } from '../utils/quran-bookmarks';

export function useQuranBookmarks(profile?: 'hafs' | 'warsh') {
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const load = async () => {
      const request = ++revision;
      const api = window.electronAPI?.studyNotes;
      if (!api) return;
      try {
        const result = await api.list();
        if (alive && request === revision) { setNotes(result); setFailed(false); }
      } catch { if (alive && request === revision) setFailed(true); }
    };
    const update = () => void load();
    update();
    window.addEventListener('baglib:notes-changed', update);
    const unsubscribe = window.electronAPI?.studyNotes?.onChanged?.(update);
    return () => { alive = false; window.removeEventListener('baglib:notes-changed', update); unsubscribe?.(); };
  }, []);
  const bookmarks = useMemo(() => profile ? quranBookmarks(notes, profile) : [], [notes, profile]);
  return { bookmarks, failed };
}
