'use client';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useToast } from '../ui/Toast';
import { Button, Sheet } from '../ui';
import type { NotificationRecord } from '../../../shared/notifications';

export const NOTIFICATION_SNOOZE_EVENT = 'baglib:notification-snooze';
export function NotificationCenter() {
  const { t, lang, dir, isZenMode, setViewMode } = useWorkspace();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.electronAPI?.athan?.setNotificationContext?.({ focused: isZenMode, language: lang }).catch(() => setFailed(true));
  }, [isZenMode, lang]);
  useEffect(() => {
    const api = window.electronAPI?.athan;
    const received = api?.onNotification?.(record => {
      showToast({ message: <span dir="auto">{record.title}</span>, duration: 10000, action: { label: t('notificationOpen'), onClick: () => { setOpen(true); } } });
    });
    const opened = api?.onNotificationOpen?.(record => { setOpen(false); setViewMode(record.target); });
    return () => { received?.(); opened?.(); };
  }, [showToast, t, setViewMode]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = () => { void window.electronAPI?.athan?.notificationHistory?.().then(records => { if (alive) setHistory(records); }).catch(() => { if (alive) setFailed(true); }); };
    load();
    const timer = setInterval(load, 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [open]);
  const act = async (record: NotificationRecord, action: 'snooze' | 'done' | 'open') => {
    setBusy(true); setFailed(false);
    try {
      setHistory(await window.electronAPI.athan.notificationAction(record.id, action));
      if (action === 'snooze' && ['prayer', 'dhikr', 'wird'].includes(record.kind)) {
        window.dispatchEvent(new Event(NOTIFICATION_SNOOZE_EVENT));
        setOpen(false);
      }
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" data-notification-history-open aria-label={t('notificationHistory')} title={t('notificationHistory')} onClick={() => setOpen(true)} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-focus"><Bell className="size-4" /></button>
    {/* The titlebar's backdrop blur would confine a fixed sheet to its 48 px; render the sheet at the document root. */}
    {open && typeof document !== 'undefined' && createPortal(<Sheet open={open} onClose={() => setOpen(false)} title={t('notificationHistory')}>
      <div dir={dir} className="space-y-4 text-start leading-loose" data-notification-history>
        {failed && <p role="alert">{t('studyActionFailed')}</p>}
        {!history.length && <p>{t('notificationEmpty')}</p>}
        {history.map(record => <article key={record.id} data-notification-id={record.id} data-notification-status={record.status} className="space-y-2 rounded-xl border border-subtle p-3">
          <h3 dir="auto" className="break-words font-semibold">{record.title}</h3>
          <p dir="auto" className="break-words text-sm text-muted">{record.body}</p>
          <time className="text-xs text-muted" dateTime={record.createdAt}>{new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.createdAt))}</time>
          {record.status !== 'new' && <p className="text-xs">{t(record.status === 'done' ? 'notificationCompleted' : record.status === 'snoozed' ? 'notificationSnoozed' : 'notificationSuppressed')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy || record.status === 'done'} data-notification-action="snooze" onClick={() => void act(record, 'snooze')}>{t('notificationSnooze')}</Button>
            <Button size="sm" variant="secondary" disabled={busy || record.status === 'done'} data-notification-action="done" onClick={() => void act(record, 'done')}>{t('notificationDone')}</Button>
            <Button size="sm" disabled={busy} data-notification-action="open" onClick={() => void act(record, 'open')}>{t('notificationOpen')}</Button>
          </div>
        </article>)}
      </div>
    </Sheet>, document.body)}
  </>;
}
