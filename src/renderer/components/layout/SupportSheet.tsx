'use client';
import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Sheet, Button } from '../ui';
import packageMetadata from '../../../../package.json';
import { shortcutHint } from '../actions/shortcuts';

export function SupportSheet() {
  const { isSupportSheetOpen, setIsSupportSheetOpen, t } = useWorkspace();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof window.electronAPI.getSystemInfo>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!isSupportSheetOpen || !window.electronAPI?.getSystemInfo) return;
    let alive = true;
    void window.electronAPI.getSystemInfo().then(value => { if (alive) { setInfo(value); setFailed(false); } }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [isSupportSheetOpen]);
  return <Sheet open={!!isSupportSheetOpen} onClose={() => setIsSupportSheetOpen(false)} side="end" title={t('settingAbout')}>
    <div data-about-support className="space-y-6 text-start text-sm leading-loose text-main">
      <h2 className="font-display text-xl">{t('brand')}</h2>
      <dl className="space-y-4">
        <div><dt className="text-muted">{t('supportVersion')}</dt><dd dir="auto">{info?.version || `v${packageMetadata.version}-alpha`}</dd></div>
        <div><dt className="text-muted">{t('supportDataLocation')}</dt><dd dir="auto" className="break-all select-text">{info?.dataLocation || t('loading')}</dd></div>
        <div><dt className="text-muted">{t('supportEnvironment')}</dt><dd>Electron / Chromium</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" data-support-logs onClick={() => { void window.electronAPI.openLogsFolder().then(error => setFailed(!!error), () => setFailed(true)); }}>{t('supportLogs')}</Button>
        <Button variant="secondary" data-support-shortcuts onClick={() => { setIsSupportSheetOpen(false); window.dispatchEvent(new Event('baglib:shortcut-help')); }}>{t('shortcutSheet')} <kbd dir="ltr">{shortcutHint('help')}</kbd></Button>
        <Button variant="secondary" data-support-guide onClick={() => window.dispatchEvent(new Event('baglib:first-run'))}>{t('settingGuide')}</Button>
      </div>
      <section className="space-y-3"><h3 className="font-semibold">{t('supportReport')}</h3><p className="text-muted">{t('supportReportHint')}</p><Button variant="secondary" data-support-report onClick={() => { void window.electronAPI.openExternal('https://github.com/asdman011/Baglib/issues/new').then(opened => setFailed(!opened), () => setFailed(true)); }}>{t('supportReport')}</Button></section>
      {failed && <p role="alert">{t('studyActionFailed')}</p>}
    </div>
  </Sheet>;
}
