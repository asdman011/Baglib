'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import {
  X,
  Sliders,
  Check,
  Globe,
  Library,
  Archive,
  ArrowUp,
  ArrowDown,
  Save,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SourceUrlsPanel } from './SourceUrlsPanel';

export interface ProviderConfigItem {
  id: string;
  name: string;
  nameAr: string;
  enabled: boolean;
  priority: number;
}

interface ProviderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const ProviderSettingsModal: React.FC<ProviderSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const { lang, dir, t } = useWorkspace();
  const [configs, setConfigs] = useState<ProviderConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [baseline, setBaseline] = useState('[]');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sourceStatus, setSourceStatus] = useState({ dirty: false, busy: false });
  const savingActive = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef(0);
  const clearSaveTimer = useCallback(() => { if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = null; }, []);
  const expireSession = useCallback(() => { session.current++; savingActive.current = false; clearSaveTimer(); }, [clearSaveTimer]);
  useEffect(() => { expireSession(); return expireSession; }, [isOpen, expireSession]);
  const sourceChanged = useCallback((next: { dirty: boolean; busy: boolean }) => {
    setSourceStatus(previous => previous.dirty === next.dirty && previous.busy === next.busy ? previous : next);
  }, []);
  const closeSafely = () => {
    if (savingActive.current || sourceStatus.busy) return;
    if (JSON.stringify(configs) !== baseline || sourceStatus.dirty) setConfirmDiscard(true);
    else onClose();
  };
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const discardRef = React.useRef<HTMLDivElement>(null);

  const [previousProviderOpen, setPreviousProviderOpen] = useState<readonly unknown[] | null>(null);
  const inputsProviderOpen = [isOpen];
  if (previousProviderOpen === null || inputsProviderOpen.some((value, index) => !Object.is(value, previousProviderOpen[index]))) {
    setPreviousProviderOpen(inputsProviderOpen);
    if (isOpen) { setLoading(true); setConfirmDiscard(false); setSaving(false); setSavedSuccess(false); setSaveFailed(false); setLoadFailed(false); }
  }
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadConfigs = async () => {
      try {
        const windowAPI = (window).electronAPI;
        if (!windowAPI?.getProviderConfig) throw new Error('Provider configuration API unavailable');
        {
          const res = await windowAPI.getProviderConfig();
          if (!Array.isArray(res)) throw new Error('Invalid provider configuration');
          if (isMounted) {
            const sorted = [...res].sort((a, b) => a.priority - b.priority);
            setConfigs(sorted);
            setBaseline(JSON.stringify(sorted));
          }
        }
      } catch (err) {
        console.warn('[ProviderSettingsModal] Failed to fetch provider configs:', err);
        if (isMounted) setLoadFailed(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadConfigs();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleEnabled = (id: string) => {
    setConfigs((prev) =>
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setConfigs((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy.map((item, idx) => ({ ...item, priority: idx + 1 }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= configs.length - 1) return;
    setConfigs((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy.map((item, idx) => ({ ...item, priority: idx + 1 }));
    });
  };

  const handlePrioritySelect = (id: string, newPriority: number) => {
    setConfigs((prev) => {
      const target = prev.find((item) => item.id === id);
      if (!target || target.priority === newPriority) return prev;

      const remaining = prev.filter((item) => item.id !== id);
      remaining.splice(newPriority - 1, 0, target);
      return remaining.map((item, idx) => ({ ...item, priority: idx + 1 }));
    });
  };

  const handleSave = async () => {
    if (savingActive.current || loading || loadFailed || !configs.length || sourceStatus.busy || sourceStatus.dirty) return;
    const activeSession = session.current;
    savingActive.current = true;
    setSaving(true);
    setSaveFailed(false);
    try {
      const windowAPI = (window).electronAPI;
      if (!windowAPI?.updateProviderConfig) throw new Error('Provider configuration API unavailable');
      await windowAPI.updateProviderConfig(configs);
      if (activeSession !== session.current) return;
      setBaseline(JSON.stringify(configs));
      setSavedSuccess(true);
      saveTimer.current = setTimeout(() => {
        if (activeSession !== session.current) return;
        savingActive.current = false;
        setSaving(false);
        setSavedSuccess(false);
        if (onSaved) onSaved();
        onClose();
      }, 700);
    } catch (err) {
      if (activeSession !== session.current) return;
      console.error('[ProviderSettingsModal] Error saving configs:', err);
      setSaving(false);
      savingActive.current = false;
      setSaveFailed(true);
    }
  };

  const getProviderIcon = (id: string) => {
    if (id === 'google-books') return <Globe className="w-5 h-5 text-blue-500" />;
    if (id === 'internet-archive') return <Archive className="w-5 h-5 text-purple-500" />;
    return <Library className="w-5 h-5 text-emerald-500" />;
  };

  const getProviderBadgeColor = (id: string) => {
    if (id === 'google-books') return 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400';
    if (id === 'internet-archive') return 'border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400';
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSafely();
      }}
      className="fixed inset-0 z-70 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
      dir={dir}
    >
      <Modal open={isOpen} onClose={closeSafely} asChild focusRef={dialogRef} label={t('unsavedChangesTitle')}><div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('providerSettingsModalTitle')} tabIndex={-1} className="relative w-full max-w-xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] font-sans">
        {confirmDiscard && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Modal open={isOpen && confirmDiscard} onClose={() => setConfirmDiscard(false)} asChild focusRef={discardRef} label={t('unsavedChangesTitle')}><div ref={discardRef} role="dialog" aria-modal="true" aria-label={t('unsavedChangesTitle')} tabIndex={-1} className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-4 space-y-3 text-sm leading-relaxed">
            <h4 className="font-bold">{t('unsavedChangesTitle')}</h4><p>{t('settingsDiscardPrompt')}</p>
            <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-subtle p-2">{t('keepEditing')}</button><button type="button" onClick={() => { setConfirmDiscard(false); onClose(); }} className="rounded-lg bg-red-600 p-2 text-white">{t('discardAndClose')}</button></div>
          </div></Modal>
        </div>}
        {/* Header */}
        <div className="p-4 sm:p-5 bg-canvas/90 border-b border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-main text-base sm:text-lg truncate">
                {t('providerSettingsModalTitle')}
              </h3>
              <p className="text-xs text-muted truncate mt-0.5">
                {t('providerSettingsModalSubtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={closeSafely}
            disabled={saving || sourceStatus.busy}
            aria-label={t('close')}
            className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer shrink-0"
            title={t('cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content List */}
        <fieldset disabled={saving} className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-muted text-sm">
              <span className="inline-block animate-spin me-2">⟳</span>
              {lang === 'ar' ? 'جارٍ تحميل الإعدادات...' : 'Loading provider configuration...'}
            </div>
          ) : (
            configs.map((item, index) => {
              const isFirst = index === 0;
              const isLast = index === configs.length - 1;

              return (
                <div
                  key={item.id}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                    item.enabled
                      ? 'bg-surface border-subtle hover:border-amber-500/40'
                      : 'bg-canvas/50 border-subtle/50 opacity-60'
                  }`}
                >
                  {/* Left: Checkbox + Icon + Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <label className="relative flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={() => handleToggleEnabled(item.id)}
                        className="sr-only"
                      />
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                          item.enabled
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'bg-canvas border-subtle text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    </label>

                    <div className="p-2 rounded-xl bg-canvas border border-subtle shrink-0">
                      {getProviderIcon(item.id)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-main truncate">
                          {lang === 'ar' ? item.nameAr : item.name}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getProviderBadgeColor(
                            item.id
                          )}`}
                        >
                          #{item.priority}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted truncate mt-0.5">
                        {item.enabled
                          ? lang === 'ar'
                            ? `الأولوية ${item.priority} في التسلسل`
                            : `Priority ${item.priority} in sequence`
                          : lang === 'ar'
                          ? 'مصدر معطل حالياً'
                          : 'Currently disabled'}
                      </p>
                    </div>
                  </div>

                  {/* Right: Priority Reordering Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Priority Select Dropdown */}
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="hidden sm:inline text-[11px]">
                        {t('providerSettingsPriority')}
                      </span>
                      <select
                        value={item.priority}
                        onChange={(e) => handlePrioritySelect(item.id, parseInt(e.target.value, 10))}
                        className="px-2 py-1 rounded-lg bg-canvas border border-subtle text-main text-xs font-bold outline-none cursor-pointer focus:border-amber-500"
                      >
                        {configs.map((_, pIdx) => (
                          <option key={pIdx + 1} value={pIdx + 1}>
                            {pIdx + 1}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Move Up / Down Buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMoveUp(index)}
                        disabled={isFirst}
                        aria-label={lang === 'ar' ? 'رفع الأولوية للأعلى' : 'Move Up'} title={lang === 'ar' ? 'رفع الأولوية للأعلى' : 'Move Up'}
                        className="p-1 rounded-lg bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveDown(index)}
                        disabled={isLast}
                        aria-label={lang === 'ar' ? 'خفض الأولوية للأسفل' : 'Move Down'} title={lang === 'ar' ? 'خفض الأولوية للأسفل' : 'Move Down'}
                        className="p-1 rounded-lg bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          <SourceUrlsPanel onStatus={sourceChanged} />
          {loadFailed && <p role="alert" className="text-xs leading-relaxed text-red-500">{t('settingsLoadFailed')}</p>}
          {sourceStatus.dirty && <p role="status" className="text-xs leading-relaxed text-muted">{t('settingsSourceDraftHint')}</p>}
          {saveFailed && <p role="alert" className="text-xs leading-relaxed text-red-500">{t('settingsSaveFailed')}</p>}

          {/* Helpful Explanatory Banner */}
          <div className="p-3.5 rounded-2xl bg-canvas border border-subtle flex items-start gap-3 text-xs text-muted leading-relaxed">
            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-main">
                {lang === 'ar'
                  ? 'جلب شامل بدون حجب مصادر'
                  : 'Comprehensive multi-source metadata discovery'}
              </p>
              <p className="mt-0.5 text-[11px]">
                {lang === 'ar'
                  ? 'يتم الاستعلام من جميع المصادر المفعلة بالترتيب المحدد ودمج النتائج الذكي لمنحك أفضل غلاف وأدق بيانات، مع تطبيق الحماية التلقائية للحصة اليومية عند اللزوم.'
                  : 'All enabled providers are queried in precedence order to aggregate candidates and combine the best covers and descriptions, respecting daily limits seamlessly.'}
              </p>
            </div>
          </div>
        </fieldset>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-canvas/90 border-t border-subtle flex items-center justify-between gap-3">
          <div className="text-xs text-muted">
            {savedSuccess && (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold animate-in fade-in">
                <Check className="w-4 h-4" />
                {t('providerSettingsSavedToast')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeSafely}
              disabled={saving || sourceStatus.busy}
              className="px-4 py-2 rounded-xl border border-subtle text-muted hover:text-main hover:bg-canvas text-xs font-semibold transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || loadFailed || !configs.length || sourceStatus.busy || sourceStatus.dirty}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-all flex items-center gap-2 cursor-pointer shadow-sm shadow-amber-500/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? '...' : t('providerSettingsSave')}</span>
            </button>
          </div>
        </div>
      </div></Modal>
    </div>
  );
};
