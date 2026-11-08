'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AFTER_CHANGE_QUIET_MS, DEFAULT_SAVE_POLICY, type MaterialSaveStatus, type SavePolicy } from '../../shared/material-save';

export type FileSaveState = 'saved' | 'recorded' | 'saving' | 'no-engine' | 'incident' | null;
export type SaveNotice = 'saveFailed' | 'saveExternalChange' | 'saveErrorBusy' | null;

/**
 * The save policy of one open material (ADR-012). `changed()` is called after each completed editing action; in
 * after-change mode a short quiet period groups a burst into one write. Interval mode writes only when something is
 * pending. `saveNow()` (Ctrl+S, Save) writes immediately in every mode.
 */
export function useMaterialSave(workId: string | null, enabled: boolean) {
  const [status, setStatus] = useState<MaterialSaveStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<SaveNotice>(null);
  const [policy, setPolicy] = useState<SavePolicy>(DEFAULT_SAVE_POLICY);
  const quiet = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePolicy = useRef<SavePolicy | null>(null);
  const running = useRef(false);
  const api = typeof window !== 'undefined' ? window.electronAPI?.materialSave : undefined;

  const refresh = useCallback(async () => {
    if (!enabled || !workId || !api) return null;
    const result = await api.status(workId).catch(() => null);
    if (result?.ok) { setStatus(result.data); return result.data; }
    return null;
  }, [api, enabled, workId]);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = useCallback(() => {
    if (quiet.current) clearTimeout(quiet.current);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    quiet.current = null;
    refreshTimer.current = null;
  }, []);
  const clearTimers = useCallback(() => {
    clearPending();
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = null;
  }, [clearPending]);
  const show = useCallback((value: SaveNotice) => {
    setNotice(value);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);
  const saveNow = useCallback(async () => {
    if (!enabled || !workId || !api || running.current) return false;
    running.current = true; setSaving(true);
    try {
      const result = await api.save(workId);
      if (!result.ok) { show(result.error === 'busy' ? 'saveErrorBusy' : 'saveFailed'); return false; }
      if (result.data.externalChange) show('saveExternalChange');
      return true;
    } catch { show('saveFailed'); return false; }
    finally { running.current = false; setSaving(false); await refresh(); }
  }, [api, enabled, refresh, show, workId]);

  useEffect(() => {
    activePolicy.current = null;
    if (!enabled || !api) return;
    let live = true;
    let changedSinceLoad = false;
    void api.policy().then(result => { if (live && !changedSinceLoad && result.ok) { activePolicy.current = result.data.policy; setPolicy(result.data.policy); } }, () => {});
    const listen = (event: Event) => {
      changedSinceLoad = true;
      clearPending();
      activePolicy.current = (event as CustomEvent<SavePolicy>).detail;
      setPolicy((event as CustomEvent<SavePolicy>).detail);
    };
    window.addEventListener('baglib:save-policy', listen);
    return () => { live = false; activePolicy.current = null; clearPending(); window.removeEventListener('baglib:save-policy', listen); };
  }, [api, enabled, clearPending]);

  useEffect(() => {
    if (!enabled || !workId || !api) return;
    let live = true;
    void api.status(workId).then(result => { if (live && result.ok) setStatus(result.data); }, () => {});
    return () => { live = false; };
  }, [api, enabled, workId]);

  const changed = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { refreshTimer.current = null; void refresh(); }, 0);
    if (!enabled || !workId || !api || activePolicy.current?.mode !== 'after-change') return;
    if (quiet.current) clearTimeout(quiet.current);
    quiet.current = setTimeout(() => { quiet.current = null; if (activePolicy.current?.mode === 'after-change') void saveNow(); }, AFTER_CHANGE_QUIET_MS);
  }, [api, enabled, workId, refresh, saveNow]);

  useEffect(() => {
    if (policy.mode !== 'interval' || !enabled) return;
    const timer = setInterval(() => { if (activePolicy.current?.mode !== 'interval') return; void refresh().then(current => { if (activePolicy.current?.mode === 'interval' && current?.pending && current.writable && !current.incident) void saveNow(); }); }, policy.intervalMinutes * 60_000);
    return () => clearInterval(timer);
  }, [enabled, policy, refresh, saveNow]);

  useEffect(() => clearPending, [enabled, workId, clearPending]);
  useEffect(() => clearTimers, [clearTimers]);

  const state: FileSaveState = !status?.supported ? null : saving ? 'saving' : status.incident ? 'incident' : !status.pending ? 'saved' : status.writable ? 'recorded' : 'no-engine';
  return { status, state, notice, clearNotice: () => setNotice(null), policy, saveNow, changed, refresh };
}
