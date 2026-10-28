'use client';
import React, { useCallback, useEffect, useState } from 'react';
import type { PdfCloudAPI, PdfCloudFile, PdfCloudLink, PdfCloudProvider, PdfCloudResult, PdfCloudStatus } from '../../../shared/types/pdf-cloud';
import type { PdfSession, PdfJob } from '../../../shared/types/pdf-editor';
import { useWorkspace } from '../context/WorkspaceContext';
import type { TranslationKey } from '../../translations';

const errors: Partial<Record<string, TranslationKey>> = {
  'not-configured': 'pdfCloudNotConfigured', 'not-connected': 'pdfCloudNotConnected', 'secure-storage-unavailable': 'pdfCloudSecureUnavailable', conflict: 'pdfCloudConflict', 'source-changed': 'pdfSuiteSourceChanged', 'login-cancelled': 'pdfCloudLoginCancelled', 'login-timeout': 'pdfCloudLoginTimeout', 'too-large': 'pdfCloudTooLarge', 'invalid-pdf': 'pdfCloudInvalidPdf',
};
export function PdfCloudPanel({ session, output }: { session: PdfSession | null; output?: PdfJob | null }) {
  const { t, lang, dir, refreshBooks } = useWorkspace();
  const [provider, setProvider] = useState<PdfCloudProvider>('google');
  const [status, setStatus] = useState<PdfCloudStatus | null>(null);
  const [clientId, setClientId] = useState('');
  const [tenant, setTenant] = useState('common');
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<PdfCloudFile[]>([]);
  const [links, setLinks] = useState<PdfCloudLink[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [failure, setFailure] = useState(false);
  const [exportTarget, setExportTarget] = useState(session?.sha256 ? 'saved' : '0');
  const [name, setName] = useState(session?.filename || '');
  const fieldClass = 'block w-full rounded border border-subtle bg-canvas p-2';
  const folder = folders.at(-1)?.id || 'root';
  const api = (): PdfCloudAPI => window.electronAPI.pdfCloud;
  const unwrap = <T,>(result: PdfCloudResult<T>): T => { if (result.ok === false) throw new Error(result.error); return result.data; };
  const refreshLinks = async () => setLinks(unwrap(await api().links()));
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage(null); setFailure(false);
    try { await action(); }
    catch (error) { setFailure(true); setMessage(errors[(error as Error).message] || 'pdfCloudFailure'); }
    finally { setBusy(false); }
  };
  const browse = async (id: string, cursor?: string) => {
    const page = unwrap(await api().list(provider, id, cursor));
    setFiles(previous => cursor ? [...previous, ...page.files] : page.files); setNext(page.next);
  };
  const reload = useCallback(async () => {
    const result = await window.electronAPI.pdfCloud.status(provider);
    if (result.ok === false) throw new Error(result.error);
    setStatus(result.data); return result.data;
  }, [provider]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      void window.electronAPI.pdfCloud.status(provider).then(result => {
        if (!alive) return;
        if (result.ok === false) { setFailure(true); setMessage(errors[result.error] || 'pdfCloudFailure'); return; }
        setStatus(result.data); setClientId(result.data.clientId); setTenant(result.data.tenant); setFolders([]); setFiles([]); setNext(undefined); setMessage(null);
      }).catch(() => { if (alive) { setFailure(true); setMessage('pdfCloudFailure'); } });
      void window.electronAPI.pdfCloud.links().then(result => { if (alive && result.ok) setLinks(result.data); });
    }, 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [provider]);
  const connect = () => void perform(async () => {
    unwrap(await api().configure(provider, { clientId, tenant }));
    setLogin(true);
    try { unwrap(await api().connect(provider, lang)); } finally { setLogin(false); }
    await reload(); await browse('root'); await refreshLinks();
  });
  return <section dir={dir} aria-label={t('pdfSuiteCloud')} className="space-y-3 border-t border-subtle pt-4 leading-relaxed">
    <h3 className="font-semibold">{t('pdfSuiteCloud')}</h3>
    <p className="text-xs text-muted">{t('pdfCloudLocalFirst')}</p>
    <label className="block"><span>{t('pdfCloudProvider')}</span><select value={provider} disabled={busy} onChange={event => setProvider(event.target.value as PdfCloudProvider)} className="block w-full rounded border border-subtle bg-canvas p-2"><option value="google">{t('pdfCloudGoogle')}</option><option value="microsoft">{t('pdfCloudMicrosoft')}</option></select></label>
    <p className="text-xs text-muted">{t(provider === 'google' ? 'pdfCloudGoogleScope' : 'pdfCloudMicrosoftScope')}</p>
    <label className="block"><span>{t('pdfCloudClientId')}</span><input dir="ltr" autoComplete="off" value={clientId} disabled={busy} onChange={event => setClientId(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2" /></label>
    {provider === 'microsoft' && <label className="block"><span>{t('pdfCloudTenant')}</span><input dir="ltr" value={tenant} disabled={busy} onChange={event => setTenant(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2" /></label>}
    <p className="text-xs text-muted">{t('pdfCloudSetup')}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || !clientId.trim()} onClick={() => void perform(async () => { setStatus(unwrap(await api().configure(provider, { clientId, tenant }))); setMessage('pdfCloudConfigured'); })} className="rounded border border-subtle p-2 disabled:opacity-40">{t('pdfCloudSaveConfig')}</button>
      <button type="button" disabled={busy || !clientId.trim() || status?.secureStorage === false} onClick={connect} className="rounded bg-emerald-700 text-white p-2 disabled:opacity-40">{t('pdfCloudConnect')}</button>
      {login && <button type="button" onClick={() => { void api().cancelLogin(provider); }} className="underline p-2">{t('pdfSuiteCancel')}</button>}
      {status?.connected && <button type="button" disabled={busy} onClick={() => void perform(async () => { unwrap(await api().disconnect(provider)); await reload(); await refreshLinks(); setFiles([]); setNext(undefined); })} className="rounded border border-subtle p-2">{t('pdfCloudDisconnect')}</button>}
    </div>
    <p role="status" className="text-xs">{t(login ? 'pdfCloudSigningIn' : status?.connected ? 'pdfCloudConnected' : 'pdfCloudNotConnected')}</p>
    {message && <p role={failure ? 'alert' : 'status'}>{t(message)}</p>}
    {status?.connected && <>
      <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={() => void perform(() => browse(folder))} className="rounded border border-subtle p-2">{t('pdfCloudBrowse')}</button>{folders.length > 0 && <button type="button" disabled={busy} onClick={() => void perform(async () => { const parent = folders.slice(0, -1); await browse(parent.at(-1)?.id || 'root'); setFolders(parent); })} className="underline p-2">{t('pdfCloudParent')}</button>}<span dir="auto" className="break-all">{folders.at(-1)?.name || t('pdfCloudRoot')}</span></div>
      <ul className="space-y-2">{files.map(file => <li key={file.id} className="rounded-lg border border-subtle p-2"><p dir="auto" className="break-words font-medium">{file.name}</p><div className="flex flex-wrap gap-2 text-xs">
        {file.folder ? <button type="button" disabled={busy} onClick={() => void perform(async () => { await browse(file.id); setFolders(previous => [...previous, { id: file.id, name: file.name }]); })} className="underline p-1">{t('pdfCloudOpenFolder')}</button> : /\.pdf$/iu.test(file.name) ? <>
          <button type="button" disabled={busy} onClick={() => void perform(async () => { const imported = unwrap(await api().import(provider, file.id)); await window.electronAPI.pdfEditor.close(imported.session.id); await refreshBooks(); setMessage('pdfCloudImported'); })} className="underline p-1">{t('pdfCloudImportWork')}</button>
          {session?.workId && <button type="button" disabled={busy} onClick={() => void perform(async () => { const imported = unwrap(await api().import(provider, file.id, session.workId!)); await window.electronAPI.pdfEditor.close(imported.session.id); await refreshBooks(); setMessage('pdfCloudImported'); })} className="underline p-1">{t('pdfCloudImportEdition')}</button>}
          {session?.sourceId && <button type="button" disabled={busy} onClick={() => void perform(async () => { unwrap(await api().link(provider, session.id, file.id)); await refreshLinks(); setMessage('pdfCloudLinked'); })} className="underline p-1">{t('pdfCloudLink')}</button>}
        </> : null}
      </div></li>)}</ul>
      {next && <button type="button" disabled={busy} className="underline" onClick={() => void perform(() => browse(folder, next))}>{t('pdfCloudMore')}</button>}
      {session && <div className="space-y-2 border-t border-subtle pt-3"><label>{t('pdfCloudExportTarget')}<select value={exportTarget} className={fieldClass} onChange={event => { const value = event.target.value; setExportTarget(value); setName(value === 'saved' ? session.filename : output?.outputs?.[Number(value)]?.filename || ''); }}>{session.sha256 && <option value="saved">{t('pdfCloudSavedSource')}</option>}{output?.outputs?.map((item, index) => <option key={index} value={String(index)}>{t('pdfCloudStagedOutput', { name: item.filename })}</option>)}</select></label><label><span>{t('pdfCloudExportName')}</span><input dir="auto" value={name} onChange={event => setName(event.target.value)} className="block w-full rounded border border-subtle bg-canvas p-2" /></label><button type="button" disabled={busy || !name.trim() || exportTarget !== 'saved' && !output?.outputs?.[Number(exportTarget)]} onClick={() => void perform(async () => { const file = unwrap(await (exportTarget === 'saved' ? api().export(provider, session.id, folder, name) : output ? api().exportOutput(provider, output.id, Number(exportTarget), folder, name) : Promise.reject(new Error('invalid-request')))); setMessage('pdfCloudExported'); await browse(folder); setFiles(previous => previous.some(item => item.id === file.id) ? previous : [...previous, file]); })} className="rounded border border-subtle p-2">{t('pdfCloudExport')}</button><p className="text-xs text-muted">{t('pdfCloudExportSaved')}</p></div>}
    </>}
    {links.filter(link => link.provider === provider).map(link => <div key={link.id} className="rounded border border-subtle p-2 space-y-2"><p dir="auto" className="break-words">{link.name}</p><label className="flex items-center gap-2"><input type="checkbox" checked={link.enabled} disabled={busy || !status?.connected} onChange={event => void perform(async () => { unwrap(await api().setSync(link.id, event.target.checked)); await refreshLinks(); })} /><span>{t('pdfCloudEnableSync')}</span></label><p className="text-xs text-muted">{t('pdfCloudSyncPolicy')}</p>{link.state === 'conflict' && <p role="alert">{t('pdfCloudConflict')}</p>}{link.state === 'error' && <p role="alert">{t(errors[link.error || ''] || 'pdfCloudFailure')}</p>}<button type="button" disabled={busy || !link.enabled} onClick={() => void perform(async () => { const result = unwrap(await api().sync(link.id)); await refreshLinks(); if (result.error) throw new Error(result.error); setMessage('pdfCloudSynced'); })} className="underline p-1">{t('pdfCloudSyncNow')}</button><button type="button" disabled={busy || link.state === 'syncing'} onClick={() => void perform(async () => { unwrap(await api().unlink(link.id)); await refreshLinks(); })} className="underline p-1">{t('pdfCloudUnlink')}</button></div>)}
  </section>;
}
