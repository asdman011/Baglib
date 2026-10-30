'use client';
import React, { useEffect, useState } from 'react';
import { studyLinks, type StudyNote } from '../../../shared/study-notes';
import { useWorkspace } from '../context/WorkspaceContext';
import { openPoetryReference } from '../../utils/poetry-navigation';
import type { PoetrySavedItem } from '../../../shared/types/poetry';

export function SavedPoetryNotes() {
  const { t } = useWorkspace();
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [failed, setFailed] = useState(false);
  const [items, setItems] = useState<PoetrySavedItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [legacyLimit, setLegacyLimit] = useState(40);
  const [loading, setLoading] = useState(false);
  const open = (target: string) => {
    const [, , poemId, from, to] = target.split(':');
    openPoetryReference({ poemId: +poemId, from: +from, to: +to });
  };
  const more = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (next !== null) {
        const result = await window.electronAPI.poetry.saved(next);
        if (!result.ok) throw new Error(result.error);
        setItems(previous => [...previous, ...result.data.items]); setNext(result.data.next);
      }
      setLegacyLimit(value => value + 40);
    } catch { setFailed(true); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let alive = true;
    void window.electronAPI.studyNotes.list().then(all => { if (alive) setNotes(all.filter(note => studyLinks(note.content).some(link => link.target.startsWith('poetry:ashaar:')))); }).catch(() => { if (alive) setFailed(true); });
    void window.electronAPI.poetry.saved().then(result => { if (!alive) return; if (result.ok) { setItems(result.data.items); setNext(result.data.next); } else setFailed(true); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  return <aside aria-label={t('bayanSavedVerses')} className="max-h-60 overflow-y-auto rounded-xl border border-subtle bg-surface p-4">
    <h2 className="font-semibold">{t('bayanSavedVerses')}</h2>
    {failed && <p role="alert">{t('bayanUnavailable')}</p>}
    {!notes.length && !items.length && <p>{t('bayanNoSavedVerses')}</p>}
    {items.map(item => <button type="button" key={item.id} className="block w-full border-b border-subtle p-3 text-start" onClick={() => open(item.reference)}><span>{t(item.type === 'quote' ? 'bayanQuote' : item.type === 'bookmark' ? 'bayanBookmark' : 'bayanNote')}</span><span dir="auto" className="block truncate">{item.label}</span><span dir="auto" className="block line-clamp-2 whitespace-pre-wrap text-sm text-muted">{item.text || item.note}</span></button>)}
    {notes.slice(0, legacyLimit).map(note => <button type="button" key={note.id} className="block w-full border-b border-subtle p-3 text-start" onClick={() => {
      const target = studyLinks(note.content).find(link => link.target.startsWith('poetry:ashaar:'))!.target;
      open(target);
    }}>{note.title}</button>)}
    {(next !== null || notes.length > legacyLimit) && <button type="button" disabled={loading} onClick={() => void more()}>{t('bayanMore')}</button>}
  </aside>;
}
