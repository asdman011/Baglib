'use client';
/** KEY-370 (RE-9): "Send to manuscript" from the readers, with a manuscript and chapter picker (default: last used). */
import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Modal } from '../ui/Modal';
import type { Manuscript, ManuscriptDocument } from '../../../shared/manuscripts';
import {
  LAST_CHAPTER_STORAGE_KEY, LAST_MANUSCRIPT_STORAGE_KEY, MANUSCRIPT_DOCUMENT_CHANGED_EVENT, SEND_TO_MANUSCRIPT_EVENT,
  isManuscriptDocumentOpen, pickDefaultId, sendPayloadToDocument, type SendToManuscriptPayload,
} from '../../../shared/manuscript-transfer';

function readStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ }
}

export function SendToManuscriptDialog() {
  const { t } = useWorkspace();
  const [payload, setPayload] = useState<SendToManuscriptPayload | null>(null);
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [chapters, setChapters] = useState<ManuscriptDocument[]>([]);
  const [manuscriptId, setManuscriptId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'manuscriptSendDone' | 'manuscriptSendFailed' | 'manuscriptSendOpen' | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      setPayload((event as CustomEvent<SendToManuscriptPayload>).detail);
      setStatus(null);
      void window.electronAPI.manuscripts.list().then(list => {
        setManuscripts(list);
        setManuscriptId(pickDefaultId(list, readStored(LAST_MANUSCRIPT_STORAGE_KEY)));
      }).catch(() => setStatus('manuscriptSendFailed'));
    };
    window.addEventListener(SEND_TO_MANUSCRIPT_EVENT, open);
    return () => window.removeEventListener(SEND_TO_MANUSCRIPT_EVENT, open);
  }, []);

  useEffect(() => {
    if (!manuscriptId) return;
    let live = true;
    void window.electronAPI.manuscripts.documents(manuscriptId).then(list => {
      if (!live) return;
      setChapters(list);
      setChapterId(pickDefaultId(list, readStored(LAST_CHAPTER_STORAGE_KEY)));
    }).catch(() => setStatus('manuscriptSendFailed'));
    return () => { live = false; };
  }, [manuscriptId]);

  useEffect(() => {
    if (status !== 'manuscriptSendDone') return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status]);

  const send = async () => {
    if (!payload || !chapterId) return;
    if (isManuscriptDocumentOpen(chapterId)) { setStatus('manuscriptSendOpen'); return; }
    setBusy(true);
    try {
      await sendPayloadToDocument(window.electronAPI.manuscripts, chapterId, payload);
      writeStored(LAST_MANUSCRIPT_STORAGE_KEY, manuscriptId);
      writeStored(LAST_CHAPTER_STORAGE_KEY, chapterId);
      window.dispatchEvent(new CustomEvent(MANUSCRIPT_DOCUMENT_CHANGED_EVENT, { detail: { id: chapterId } }));
      setPayload(null);
      setStatus('manuscriptSendDone');
    } catch {
      setStatus('manuscriptSendFailed');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Modal open={!!payload} onClose={() => setPayload(null)} title={t('manuscriptSendTitle')}>
      {payload && <div className="space-y-3 text-sm">
        <p className="rounded-lg border border-border p-3 leading-loose" dir="auto">{payload.props.label}</p>
        {!manuscripts.length ? <p>{t('manuscriptSendNone')}</p> : <>
          <label className="block"><span>{t('manuscriptSendManuscript')}</span>
            <select className="mt-1 block w-full rounded-lg border border-border bg-canvas p-2" value={manuscriptId} onChange={event => setManuscriptId(event.target.value)}>
              {manuscripts.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <label className="block"><span>{t('manuscriptSendChapter')}</span>
            <select className="mt-1 block w-full rounded-lg border border-border bg-canvas p-2" value={chapterId} onChange={event => setChapterId(event.target.value)}>
              {chapters.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-border px-3 py-2" onClick={() => setPayload(null)}>{t('cancel')}</button>
            <button type="button" className="rounded-lg bg-primary px-3 py-2 text-primary-contrast" disabled={busy || !chapterId} aria-busy={busy} onClick={() => void send()}>{t('manuscriptSendConfirm')}</button>
          </div>
        </>}
        {(status === 'manuscriptSendFailed' || status === 'manuscriptSendOpen') && <p role="alert">{t(status)}</p>}
      </div>}
    </Modal>
    {status === 'manuscriptSendDone' && <p role="status" className="fixed bottom-4 inset-x-4 z-[210] mx-auto w-fit rounded-xl border border-border bg-surface p-3 text-sm text-text shadow-lg">{t('manuscriptSendDone')}</p>}
  </>;
}
