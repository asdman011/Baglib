'use client';
import { useCallback, useEffect, useState } from 'react';
import { HIGHLIGHTS_CHANGED_EVENT, isPassageHighlightColor, type PassageHighlightColor } from '../../shared/passage-highlights';

export interface PassageHighlight { id: string; location: string; color: PassageHighlightColor; quotedText: string }

/** KEY-340: colour highlights whose location starts with a prefix (quran:, sunnah:, poetry:), kept in sync. */
export function usePassageHighlights(prefix: string): PassageHighlight[] {
  const [items, setItems] = useState<PassageHighlight[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const all = await Promise.resolve(window.electronAPI?.knowledge?.getAll?.() ?? []).catch(() => []);
      if (!alive || !Array.isArray(all)) return;
      setItems(all.filter(item => item.knowledgeType === 'highlight' && !item.workId && typeof item.location === 'string' && item.location.startsWith(prefix))
        .map(item => ({ id: item.id, location: item.location, color: isPassageHighlightColor(item.color) ? item.color : 'amber', quotedText: item.quotedText ?? '' })));
    };
    void load();
    const update = () => void load();
    window.addEventListener(HIGHLIGHTS_CHANGED_EVENT, update);
    return () => { alive = false; window.removeEventListener(HIGHLIGHTS_CHANGED_EVENT, update); };
  }, [prefix]);
  return items;
}

/** Save or remove passage highlights, then tell every reader to refresh. */
export function usePassageHighlightActions() {
  const save = useCallback(async (location: string, color: PassageHighlightColor, quotedText: string) => {
    await window.electronAPI.knowledge.save({ workId: null, knowledgeType: 'highlight', location, quotedText, color });
    window.dispatchEvent(new CustomEvent(HIGHLIGHTS_CHANGED_EVENT));
  }, []);
  const remove = useCallback(async (ids: string[]) => {
    for (const id of ids) await window.electronAPI.knowledge.delete(id);
    window.dispatchEvent(new CustomEvent(HIGHLIGHTS_CHANGED_EVENT));
  }, []);
  return { save, remove };
}
