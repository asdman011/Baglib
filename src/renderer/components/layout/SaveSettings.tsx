'use client';
import React, { useEffect, useState } from 'react';
import { FolderOpen, Save } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { SAVE_MODES, type SaveMode, type SavePolicy } from '../../../shared/material-save';
import type { TranslationKey } from '../../translations';
import { InfoTip } from './InfoTip';

const modeKeys: Record<SaveMode, [TranslationKey, TranslationKey]> = {
  'after-change': ['saveModeAfterChange', 'saveModeAfterChangeInfo'],
  interval: ['saveModeInterval', 'saveModeIntervalInfo'],
  manual: ['saveModeManual', 'saveModeManualInfo'],
};

/** Settings → Saving into files (ADR-012): the save mode, the interval, and the one emergency copy's folder. */
export function SaveSettings() {
  const { t, lang, dir } = useWorkspace();
  const [undoScope, setUndoScope] = useState<'book' | 'reader'>('book');
  const [scopeSaving, setScopeSaving] = useState(true);
  const [policy, setPolicy] = useState<SavePolicy | null>(null);
  const [folder, setFolder] = useState({ current: '', fallback: '' });
  const [error, setError] = useState<TranslationKey | null>(null);
  useEffect(() => {
    void window.electronAPI?.settings.get('undo.scope.v1', 'book').then(value => { setUndoScope(value === 'reader' ? 'reader' : 'book'); setScopeSaving(false); }, () => { setError('studyActionFailed'); setScopeSaving(false); });

    void window.electronAPI?.materialSave?.policy().then(result => {
      if (result.ok) { setPolicy(result.data.policy); setFolder({ current: result.data.backupFolder, fallback: result.data.defaultFolder }); }
    });
  }, []);
  const update = async (next: SavePolicy) => {
    setPolicy(next);
    const result = await window.electronAPI.materialSave.setPolicy(next);
    if (result.ok) { setPolicy(result.data); window.dispatchEvent(new CustomEvent('baglib:save-policy', { detail: result.data })); }
  };
  const updateScope = async (next: 'book' | 'reader') => {
    setScopeSaving(true);
    setError(null);
    try { await window.electronAPI.settings.set('undo.scope.v1', next); setUndoScope(next); }
    catch { setError('studyActionFailed'); }
    finally { setScopeSaving(false); }
  };
  const choose = async () => {
    setError(null);
    const result = await window.electronAPI.materialSave.chooseFolder(lang);
    if (!result.ok) setError('saveBackupFolderFailed'); else if (result.data) setFolder(current => ({ ...current, current: result.data! }));
  };
  const info = (label: TranslationKey, text: TranslationKey) => <InfoTip label={label} ariaLabel={t('infoAbout', { label: t(label) })} text={t(text)} />;
  return <section data-save-settings dir={dir} className="w-full max-w-xl space-y-4 rounded-2xl border border-subtle bg-surface p-5 text-start text-main">
    <header className="space-y-1">
      <h3 className="flex items-center gap-2 text-sm font-bold"><Save size={15} aria-hidden="true" />{t('saveSettingsTitle')}</h3>
      <p className="text-xs leading-relaxed text-muted">{t('saveSettingsIntro')}</p>
    </header>
    {policy && <fieldset className="min-w-0 space-y-2">
      {SAVE_MODES.map(mode => <div key={mode} className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="radio" name="save-mode" data-save-mode={mode} checked={policy.mode === mode} onChange={() => void update({ ...policy, mode })} />
          {t(modeKeys[mode][0])}
        </label>
        {info(modeKeys[mode][0], modeKeys[mode][1])}
        {mode === 'interval' && policy.mode === 'interval' && <label className="ms-6 inline-flex items-center gap-2 text-xs text-muted">
          {t('saveIntervalMinutes')}
          <input type="number" data-save-interval min={1} max={120} value={policy.intervalMinutes} dir="ltr"
            onChange={event => { const minutes = Math.min(120, Math.max(1, Math.round(Number(event.target.value) || 1))); void update({ ...policy, intervalMinutes: minutes }); }}
            className="w-20 rounded-lg border border-subtle bg-canvas px-2 py-1 text-sm text-main" />
        </label>}
      </div>)}
      <p className="text-xs text-muted">{t('saveShortcutNote')}</p>
    </fieldset>}
    <fieldset className="min-w-0 space-y-2 border-t border-subtle pt-3" disabled={scopeSaving}>
      <legend className="flex items-center gap-1 text-sm font-bold leading-relaxed">{t('undoScopeTitle')}{info('undoScopeTitle', 'undoScopeInfo')}</legend>
      {(['book', 'reader'] as const).map(scope => <label key={scope} className="flex items-start gap-2 text-sm leading-relaxed">
        <input className="mt-1 shrink-0" type="radio" name="undo-scope" data-undo-scope={scope} checked={undoScope === scope} onChange={() => void updateScope(scope)} />
        {t(scope === 'book' ? 'undoScopeBook' : 'undoScopeReader')}
      </label>)}
    </fieldset>
    <div className="space-y-2 border-t border-subtle pt-3">
      <h4 className="flex items-center gap-1 text-xs font-bold">{t('saveEmergencyTitle')}{info('saveEmergencyTitle', 'saveEmergencyInfo')}</h4>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">{t('saveBackupFolder')}</span>{info('saveBackupFolder', 'saveBackupFolderInfo')}
        <code data-save-folder dir="ltr" className="min-w-0 max-w-full truncate rounded bg-canvas px-1.5 py-0.5">{folder.current}</code>
        {folder.current === folder.fallback && <span className="text-muted">{t('saveBackupFolderDefault')}</span>}
        <button type="button" data-save-choose-folder onClick={() => void choose()} className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2 py-1 hover:bg-canvas"><FolderOpen size={13} aria-hidden="true" />{t('saveBackupFolderChange')}</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{t(error)}</p>}
      <p className="flex items-center gap-1 text-xs text-muted">{t('saveRetention')}{info('saveRetention', 'saveRetentionInfo')}</p>
    </div>
  </section>;
}
