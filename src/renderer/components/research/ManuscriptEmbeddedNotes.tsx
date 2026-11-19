'use client';
/** KEY-372 (RE-11): the quick notes a manuscript embeds, read from manuscript_link (no snapshot parsing). */
import React, { useEffect, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { embeddedNoteIds } from '../../../shared/manuscript-notes';
import { ContextMenu } from '../ui/ContextMenu';
import { useOpenStudyLink } from '../../utils/use-study-link';

export function ManuscriptEmbeddedNotes({ manuscriptId, title, empty }: { manuscriptId: string; title: string; empty: string }) {
  const { linkHandlers, linkMenuItems } = useOpenStudyLink();
  const [notes, setNotes] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => {
    let live = true;
    const api = window.electronAPI;
    if (!api?.manuscripts?.links || !api.studyNotes) return;
    void Promise.all([api.manuscripts.links(manuscriptId), api.studyNotes.list()]).then(([rows, all]) => {
      if (!live) return;
      setNotes(embeddedNoteIds(rows).map(id => { const note = all.find(item => item.id === id); return { id, title: note?.title || note?.content.slice(0, 60) || id }; }));
    }).catch(() => { if (live) setNotes([]); });
    return () => { live = false; };
  }, [manuscriptId]);
  return <section data-manuscript-embedded-notes className="px-5 py-4 border-t border-border-subtle space-y-2">
    <h4 className="flex items-center gap-1.5 text-xs font-semibold text-text-main"><StickyNote className="w-3.5 h-3.5" />{title}</h4>
    {notes.length === 0 ? <p className="text-xs text-text-muted">{empty}</p> : <ul className="space-y-1">
      {notes.map(note => {
        const target = `note:${note.id}`;
        return <ContextMenu as="li" tabIndex={-1} key={note.id} items={linkMenuItems(target)}><button type="button" dir="auto" className="w-full text-start text-xs rounded-md px-2 py-1.5 hover:bg-bg-hover" {...linkHandlers(target)}>{note.title}</button></ContextMenu>;
      })}
    </ul>}
  </section>;
}
