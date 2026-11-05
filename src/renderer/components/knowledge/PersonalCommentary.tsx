'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { PenLine, Search, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { NoteHistory } from '../notes/NoteHistory';
import { COMMENTARY_KINDS, type CommentaryEntry, type CommentaryKind } from '../../../shared/personal-commentary';

const KIND_LABELS = { reflection: 'commentaryReflection', question: 'commentaryQuestion', research: 'commentaryResearch', 'cross-reference': 'commentaryCrossReference', insight: 'commentaryInsight', academic: 'commentaryAcademic' } as const;

/** The user's own words on a source. With no `reference` it only searches all of them. */
export function PersonalCommentary({ reference }: { reference?: string }) {
  const { t } = useWorkspace();
  const [entries, setEntries] = useState<CommentaryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<CommentaryKind>('reflection');
  const [editing, setEditing] = useState<CommentaryEntry | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const api = window.electronAPI.commentary;
      setEntries(query.trim() ? await api.search(query) : reference ? await api.list(reference) : []);
      setFailed(false);
    } catch { setFailed(true); }
  }, [query, reference]);
  useEffect(() => { queueMicrotask(() => void refresh()); }, [refresh]);

  const act = async (action: () => Promise<unknown>) => {
    try { await action(); await refresh(); window.dispatchEvent(new CustomEvent('baglib:notes-changed')); return true; } catch { setFailed(true); return false; }
  };
  const save = async () => {
    if (!reference) return;
    if (await act(() => window.electronAPI.commentary.save({ id: editing?.id, reference, kind, text, expectedRevision: editing?.revision }))) { setText(''); setEditing(null); }
  };

  return <details data-personal-commentary className="rounded-xl border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-sm" onToggle={event => { if (event.currentTarget.open) void refresh(); }}>
    <summary className="flex cursor-pointer items-center gap-2 font-semibold text-main"><PenLine className="size-4 text-amber-500" />{t('commentaryTitle')}</summary>
    <div className="mt-2 space-y-2">
      <p className="text-xs leading-loose text-muted">{t('commentaryNotice')}</p>
      <label className="flex items-center gap-2 rounded border border-subtle bg-canvas px-2 py-1.5"><Search className="size-3.5 text-muted" /><input dir="auto" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('commentarySearch')} aria-label={t('commentarySearch')} className="min-w-0 flex-1 bg-transparent outline-none" /></label>
      {failed && <p role="alert" className="text-red-600 dark:text-red-400">{t('knowledgeCardFailed')}</p>}
      {reference && <div className="space-y-2">
        <select aria-label={t('commentaryKind')} value={kind} onChange={event => setKind(event.target.value as CommentaryKind)} className="w-full rounded border border-subtle bg-canvas p-2">
          {COMMENTARY_KINDS.map(item => <option key={item} value={item}>{t(KIND_LABELS[item])}</option>)}
        </select>
        <textarea dir="auto" rows={3} value={text} onChange={event => setText(event.target.value)} aria-label={t('commentaryTitle')} className="w-full rounded border border-subtle bg-canvas p-2 leading-loose" />
        <button type="button" disabled={!text.trim()} onClick={() => void save()} className="rounded border border-subtle p-2 disabled:opacity-50">{t('commentarySave')}</button>
      </div>}
      {query.trim() && !entries.length && !failed && <p role="status" className="text-muted">{t('commentaryNone')}</p>}
      <ul className="space-y-2">
        {entries.map(entry => <li key={entry.id} data-commentary-entry={entry.id} className="rounded border border-subtle p-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted">{t(KIND_LABELS[entry.kind])}{entry.reference !== reference && <> · <bdi>{entry.reference}</bdi></>}</p>
            <button type="button" onClick={() => void act(() => window.electronAPI.commentary.remove(entry.id))} title={t('savedCardsDelete')} aria-label={t('savedCardsDelete')} className="shrink-0 rounded p-1 text-muted hover:bg-canvas"><Trash2 className="size-3.5" /></button>
          </div>
          <p dir="auto" className="whitespace-pre-wrap break-words leading-loose">{entry.text}</p>
          {entry.reference === reference && <button type="button" onClick={() => { setEditing(entry); setText(entry.text); setKind(entry.kind); }}>{t('studyEdit')}</button>}
          <NoteHistory id={entry.id} onChanged={() => void refresh()} />
        </li>)}
      </ul>
    </div>
  </details>;
}
