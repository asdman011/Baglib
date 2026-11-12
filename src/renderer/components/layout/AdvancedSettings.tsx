'use client';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui';
import { useToast } from '../ui/Toast';
import type { DatabaseHealth, RebuildProgress } from '../../../shared/catalog-export';

export function AdvancedSettings() {
  const { t, lang } = useWorkspace();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [health, setHealth] = useState<DatabaseHealth | null>(null);
  const [progress, setProgress] = useState<RebuildProgress | null>(null);
  const pending = useRef(false);
  useEffect(() => window.electronAPI.advanced.onRebuildProgress(setProgress), []);
  const run = async (action: 'json' | 'csv' | 'rebuild' | 'health') => {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    try {
      if (action === 'health') setHealth(await window.electronAPI.advanced.health());
      else if (action === 'rebuild') {
        setProgress({ completed: 0, total: 1 });
        await window.electronAPI.advanced.rebuildSearch();
        showToast({ message: t('advancedRebuilt'), type: 'success' });
      } else {
        const saved = await window.electronAPI.advanced.exportCatalog(action, lang);
        if (saved) showToast({ message: t('advancedExported'), type: 'success' });
      }
    } catch { showToast({ message: t('studyActionFailed'), type: 'danger' }); }
    finally { pending.current = false; setBusy(null); }
  };
  const number = (value: number) => new Intl.NumberFormat(lang).format(value);
  return <div data-advanced-settings className="min-w-0 space-y-6 text-start">
    <section className="space-y-3">
      <h3 className="font-semibold leading-loose">{t('advancedExport')}</h3>
      <p className="text-sm leading-loose text-muted">{t('advancedExportHint')}</p>
      <div className="flex flex-wrap gap-3">
        <Button data-catalog-export="json" disabled={!!busy} onClick={() => void run('json')}>{t('advancedExportJson')}</Button>
        <Button data-catalog-export="csv" disabled={!!busy} onClick={() => void run('csv')}>{t('advancedExportCsv')}</Button>
      </div>
    </section>
    <section className="space-y-3">
      <h3 className="font-semibold leading-loose">{t('advancedRebuild')}</h3>
      <p className="text-sm leading-loose text-muted">{t('advancedRebuildHint')}</p>
      <Button data-search-rebuild disabled={!!busy} onClick={() => void run('rebuild')}>{t('advancedRebuild')}</Button>
      {busy === 'rebuild' && <div role="status" className="space-y-2"><p>{t('advancedRebuilding')}</p><progress aria-label={t('advancedRebuilding')} max={progress?.total || 1} value={progress?.completed || 0} className="w-full" /></div>}
    </section>
    <section className="space-y-3">
      <h3 className="font-semibold leading-loose">{t('advancedHealth')}</h3>
      <Button data-database-health disabled={!!busy} onClick={() => void run('health')}>{t('advancedHealthCheck')}</Button>
      {health && <div data-database-health-result className="space-y-3">
        <dl className="grid grid-cols-2 gap-3 text-sm leading-loose">
          <dt>{t('advancedIntegrity')}</dt><dd>{t(health.integrity.length === 1 && health.integrity[0] === 'ok' ? 'advancedHealthy' : 'advancedUnhealthy')}</dd>
          <dt>{t('advancedPages')}</dt><dd>{number(health.pageCount)}</dd>
          <dt>{t('advancedPageSize')}</dt><dd>{number(health.pageSize)}</dd>
          <dt>{t('advancedSize')}</dt><dd>{number(health.sizeBytes)}</dd>
        </dl>
        {health.integrity.some(value => value !== 'ok') && <pre dir="auto" className="whitespace-pre-wrap break-all text-xs">{health.integrity.join('\n')}</pre>}
        <table className="w-full table-fixed text-start text-xs leading-loose"><thead><tr><th scope="col" className="text-start">{t('advancedTable')}</th><th scope="col" className="text-end">{t('advancedRows')}</th></tr></thead><tbody>{health.rows.map(row => <tr key={row.table}><th scope="row" className="break-all text-start font-mono font-normal" dir="ltr">{row.table}</th><td className="text-end">{number(row.count)}</td></tr>)}</tbody></table>
      </div>}
    </section>
    {busy && busy !== 'rebuild' && <p role="status">{t('advancedBusy')}</p>}
  </div>;
}
