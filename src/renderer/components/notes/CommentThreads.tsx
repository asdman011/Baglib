'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CornerDownLeft, MessageSquare, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { filterCommentThreads, type CommentAnchor, type CommentFilter, type CommentThread } from '../../../shared/comment-threads';
import type { TranslationKey } from '../../translations';

const filters: { id: CommentFilter; label: TranslationKey }[] = [
  { id: 'open', label: 'commentsFilterOpen' },
  { id: 'resolved', label: 'commentsFilterResolved' },
  { id: 'all', label: 'commentsFilterAll' },
];

function anchorLabel(anchor: CommentAnchor | null, t: (key: TranslationKey, params?: Record<string, string | number>) => string): string | null {
  if (!anchor) return null;
  if (anchor.kind === 'page') return t('commentsAnchorPage', { page: anchor.page });
  if (anchor.kind === 'paragraph') return t('commentsAnchorParagraph');
  return anchor.target;
}

/** Threaded comments on one knowledge item: reply, resolve, reopen, edit, delete, with open/resolved filters (ADR-010). */
export function CommentThreads({ id, onChanged, actor }: { id: string; onChanged: () => void; actor?: 'reader' }) {
  const { t, lang } = useWorkspace();
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [filter, setFilter] = useState<CommentFilter>('open');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const api = () => window.electronAPI.knowledgeHistory;
  const load = useCallback(async () => {
    try { setThreads(await window.electronAPI.knowledgeHistory.comments(id)); setFailed(false); } catch { setFailed(true); }
  }, [id]);
  useEffect(() => {
    let alive = true;
    window.electronAPI.knowledgeHistory.comments(id).then(rows => { if (alive) { setThreads(rows); setFailed(false); } }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [id]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); setReplyTo(null); setEditing(null); setText(''); await load(); onChanged(); } catch { setFailed(true); } finally { setBusy(false); }
  };
  const when = (iso: string) => iso ? new Date(iso).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const open = threads.filter(thread => !thread.resolvedAt).length;
  const visible = filterCommentThreads(threads, filter);
  const editor = (onSubmit: () => void, label: TranslationKey) => <div className="space-y-1">
    <textarea autoFocus rows={2} dir="auto" aria-label={t(label)} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && text.trim()) onSubmit(); }} className="w-full bg-canvas border border-subtle p-2 rounded leading-loose" />
    <div className="flex gap-2"><button type="button" disabled={busy || !text.trim()} onClick={onSubmit} className="rounded border border-subtle px-2 py-1 disabled:opacity-40">{t(label)}</button><button type="button" onClick={() => { setReplyTo(null); setEditing(null); setText(''); }} className="px-2 py-1 text-muted">{t('cancel')}</button></div>
  </div>;
  const body = (entryId: string, content: string, edited: boolean, createdAt: string) => editing === entryId
    ? editor(() => void run(() => api().editComment(entryId, text, actor)), 'commentsSaveEdit')
    : <>
      <p dir="auto" className="whitespace-pre-wrap break-words leading-loose">{content}</p>
      <p className="text-[11px] text-muted">{when(createdAt)}{edited ? ` · ${t('commentsEdited')}` : ''}</p>
    </>;
  const actions = (entryId: string, content: string) => <>
    <button type="button" aria-label={t('commentsEdit')} title={t('commentsEdit')} onClick={() => { setEditing(entryId); setReplyTo(null); setText(content); }} className="p-1 rounded hover:bg-canvas"><Pencil size={13} /></button>
    <button type="button" aria-label={t('commentsDelete')} title={t('commentsDelete')} onClick={() => { if (window.confirm(t('commentsDeleteConfirm'))) void run(() => api().removeComment(entryId, actor)); }} className="p-1 rounded hover:bg-canvas"><Trash2 size={13} /></button>
  </>;
  return <section data-comment-threads={id} aria-label={t('commentsTitle')} className="space-y-2">
    <header className="flex flex-wrap items-center gap-2">
      <h4 className="font-semibold flex items-center gap-1"><MessageSquare size={14} aria-hidden="true" />{t('commentsTitle')}</h4>
      <span data-comment-open-count className="rounded-full bg-amber-500/15 px-2 text-[11px]">{t('commentsOpenCount', { count: open })}</span>
      <div role="group" aria-label={t('commentsFilterLabel')} className="ms-auto flex rounded-lg border border-subtle overflow-hidden">
        {filters.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} data-comment-filter={item.id} onClick={() => setFilter(item.id)} className={`px-2 py-0.5 ${filter === item.id ? 'bg-amber-600 text-white' : 'hover:bg-canvas'}`}>{t(item.label)}</button>)}
      </div>
    </header>
    {failed && <p role="alert" className="leading-loose">{t('waveConflict')}</p>}
    {visible.length === 0 && <p className="text-muted leading-loose">{t(filter === 'resolved' ? 'commentsNoneResolved' : 'commentsNone')}</p>}
    <ul className="space-y-2 max-h-80 overflow-auto">
      {visible.map(thread => <li key={thread.id} data-comment-thread={thread.id} data-resolved={thread.resolvedAt ? 'true' : 'false'} className={`border border-subtle rounded p-2 space-y-1 ${thread.resolvedAt ? 'opacity-70' : ''}`}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {anchorLabel(thread.anchor, t) && <span className="me-2 rounded bg-canvas px-1.5 text-[11px] text-muted" dir="auto">{anchorLabel(thread.anchor, t)}</span>}
            {thread.resolvedAt && <span className="rounded bg-emerald-500/15 px-1.5 text-[11px]">{t('commentsResolvedBadge')}</span>}
            {body(thread.id, thread.content, thread.edited, thread.createdAt)}
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" data-comment-resolve aria-label={t(thread.resolvedAt ? 'commentsReopen' : 'commentsResolve')} title={t(thread.resolvedAt ? 'commentsReopen' : 'commentsResolve')} onClick={() => void run(() => api().resolveComment(thread.id, !thread.resolvedAt, actor))} className="p-1 rounded hover:bg-canvas">{thread.resolvedAt ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}</button>
            {actions(thread.id, thread.content)}
          </div>
        </div>
        {thread.replies.length > 0 && <ul className="space-y-1 border-s-2 border-subtle ps-3 ms-1">
          {thread.replies.map(reply => <li key={reply.id} data-comment-reply={reply.id} className="flex items-start gap-2"><div className="min-w-0 flex-1">{body(reply.id, reply.content, reply.edited, reply.createdAt)}</div><div className="flex shrink-0">{actions(reply.id, reply.content)}</div></li>)}
        </ul>}
        {replyTo === thread.id
          ? editor(() => void run(() => api().addComment(id, text, { parentId: thread.id, actor })), 'commentsReply')
          : <button type="button" data-comment-reply-button onClick={() => { setReplyTo(thread.id); setEditing(null); setText(''); }} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-main"><CornerDownLeft size={12} className="rtl:-scale-x-100" aria-hidden="true" />{t('commentsReply')}</button>}
      </li>)}
    </ul>
    <label className="block">{t('commentsNew')}<textarea rows={2} dir="auto" data-comment-new value={draft} onChange={event => setDraft(event.target.value)} className="w-full bg-canvas border border-subtle p-2 rounded leading-loose" /></label>
    <button type="button" data-comment-add disabled={busy || !draft.trim()} onClick={() => void run(async () => { await api().addComment(id, draft, { actor }); setDraft(''); setFilter(current => current === 'resolved' ? 'open' : current); })} className="rounded border border-subtle px-2 py-1 disabled:opacity-40">{t('waveSaveComment')}</button>
  </section>;
}
