'use client';
import { errorMessage } from '../../../shared/errors';


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  X,
  Cloud,
  RefreshCw,
  History,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Server,
  Smartphone,
  UploadCloud,
  DownloadCloud,
  Trash2,
  FolderOpen,
  BookOpen,
  Info,
  Loader2,
  HardDrive,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type {
  CloudConfig,
  CloudProviderType,
  KOSyncConfig,
  LibrarySnapshotMetadata,
  RemoteFileInfo,
} from '../../../shared/types/cloud-sync';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_KO: KOSyncConfig = { serverUrl: 'https://sync.koreader.rocks', username: '', password: '', deviceName: 'Baglib Desktop', autoSyncOnOpenClose: true, sendMetadata: true };
const DEFAULT_CLOUD: CloudConfig = { provider: 'webdav', enabled: false, autoBackupOnClose: false, remoteBackupFolder: 'Baglib/Backups', webdav: { url: '', username: '', password: '' }, nextcloud: { url: '', username: '', password: '' }, s3: { endpoint: '', bucket: '', accessKeyId: '', secretAccessKey: '', region: 'us-east-1' }, dropbox: { token: '' }, gdrive: { token: '' }, onedrive: { token: '' } };

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({ isOpen, onClose }) => {
  const { t, dir, activeBook, refreshBooks } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'koreader' | 'cloud' | 'snapshots'>('koreader');

  // --- KOReader State ---
  const [koConfig, setKoConfig] = useState<KOSyncConfig>(DEFAULT_KO);
  const [isTestingKo, setIsTestingKo] = useState(false);
  const [koStatus, setKoStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isSyncingKo, setIsSyncingKo] = useState(false);

  // --- Cloud Storage State ---
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>(DEFAULT_CLOUD);
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isBackingUpCloud, setIsBackingUpCloud] = useState(false);
  const [remoteFiles, setRemoteFiles] = useState<RemoteFileInfo[]>([]);
  const [isLoadingRemoteFiles, setIsLoadingRemoteFiles] = useState(false);

  // --- Snapshots State ---
  const [snapshots, setSnapshots] = useState<LibrarySnapshotMetadata[]>([]);
  const [newSnapshotDesc, setNewSnapshotDesc] = useState('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<{ success?: boolean; message?: string } | null>(null);
  const [savedKo, setSavedKo] = useState<KOSyncConfig | null>(null);
  const [savedCloud, setSavedCloud] = useState<CloudConfig | null>(null);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationFailed, setOperationFailed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busyRef = useRef(false);
  const session = useRef(0);
  const expire = useCallback(() => { session.current++; busyRef.current = false; }, []);
  useEffect(() => { expire(); return expire; }, [isOpen, expire]);
  const isCurrent = useCallback((token: number) => session.current === token, []);
  const dirtyKo = savedKo !== null && JSON.stringify(koConfig) !== JSON.stringify(savedKo);
  const dirtyCloud = savedCloud !== null && JSON.stringify(cloudConfig) !== JSON.stringify(savedCloud);
  const closeSafely = () => {
    if (busyRef.current) return;
    if (dirtyKo || dirtyCloud || newSnapshotDesc.trim()) setConfirmDiscard(true);
    else onClose();
  };
  const dialogRef = useDialogFocus(isOpen, closeSafely);
  const discardRef = useDialogFocus(isOpen && confirmDiscard, () => setConfirmDiscard(false));
  const [previousOpen, setPreviousOpen] = useState(isOpen);
  if (previousOpen !== isOpen) {
    setPreviousOpen(isOpen);
    if (isOpen) { setConfirmDiscard(false); setOperationBusy(false); setOperationFailed(false); setLoadingConfigs(true); setLoadFailed(false); setIsTestingKo(false); setIsSyncingKo(false); setIsTestingCloud(false); setIsBackingUpCloud(false); setIsLoadingRemoteFiles(false); setIsCreatingSnapshot(false); setIsRestoring(false); setRemoteFiles([]); }
  }
  const perform = async (action: () => Promise<unknown>) => {
    if (busyRef.current) return;
    const token = session.current;
    busyRef.current = true;
    setOperationBusy(true);
    setOperationFailed(false);
    try { await action(); }
    catch { if (isCurrent(token)) setOperationFailed(true); }
    finally { if (isCurrent(token)) { busyRef.current = false; setOperationBusy(false); } }
  };

  // Load configs on open
  useEffect(() => {
    if (!isOpen) return;

    const windowAPI = (window).electronAPI?.cloudSync;
    let alive = true;
    const token = session.current;
    void Promise.allSettled([
      Promise.resolve().then(() => { if (!windowAPI?.getKoSyncConfig) throw new Error('unavailable'); return windowAPI.getKoSyncConfig(); }),
      Promise.resolve().then(() => { if (!windowAPI?.getCloudConfig) throw new Error('unavailable'); return windowAPI.getCloudConfig(); }),
    ]).then(([ko, cloud]) => {
      if (!alive || !isCurrent(token)) return;
      if (ko.status === 'fulfilled') { const value = ko.value || DEFAULT_KO; setKoConfig(value); setSavedKo(value); } else setSavedKo(null);
      if (cloud.status === 'fulfilled') { const value = cloud.value || DEFAULT_CLOUD; setCloudConfig(value); setSavedCloud(value); } else setSavedCloud(null);
      setLoadFailed(ko.status === 'rejected' || cloud.status === 'rejected');
      setLoadingConfigs(false);
    });
    if (windowAPI?.listSnapshots) void windowAPI.listSnapshots().then(list => { if (alive && isCurrent(token)) setSnapshots(list || []); }).catch(() => {});
    return () => { alive = false; };
  }, [isOpen, isCurrent]);

  async function loadSnapshots() {
    const token = session.current;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.listSnapshots) return;
    try {
      const list = await windowAPI.listSnapshots();
      if (isCurrent(token)) setSnapshots(list || []);
    } catch (e) {
      console.error('Failed to load snapshots:', e);
    }
  }

  // --- KOReader Handlers ---
  const handleSaveKoConfig = async () => {
    const token = session.current;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.saveKoSyncConfig || !savedKo || loadingConfigs) throw new Error('unavailable');
    await windowAPI.saveKoSyncConfig(koConfig);
    if (!isCurrent(token)) return false;
    setSavedKo(koConfig);
    setKoStatus({ success: true, message: t('syncSettingsSaved') });
    return true;
  };

  const handleTestKo = async () => {
    const token = session.current;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.testKoSync) return;
    setIsTestingKo(true);
    setKoStatus(null);
    try {
      if (!await handleSaveKoConfig()) return;
      const res = await windowAPI.testKoSync(koConfig);
      if (!isCurrent(token)) return;
      setKoStatus({ success: res.success, message: res.message });
    } catch (e: unknown) {
      if (isCurrent(token)) setKoStatus({ success: false, message: errorMessage(e) });
    } finally {
      if (isCurrent(token)) setIsTestingKo(false);
    }
  };

  const handleManualKoSync = async () => {
    const token = session.current;
    if (!savedKo || dirtyKo) throw new Error('save-first');
    if (!activeBook) {
      setKoStatus({ success: false, message: t('syncOpenBookFirst') });
      return;
    }
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI) return;

    setIsSyncingKo(true);
    setKoStatus(null);
    try {
      // Pull first
      const pullRes = await windowAPI.pullKoSyncProgress(activeBook.id);
      if (!isCurrent(token)) return;
      if (pullRes.success && pullRes.data) {
        setKoStatus({ success: true, message: pullRes.message || t('koSyncSuccess') });
        await refreshBooks();
      } else {
        // Push current progress
        const percent = (activeBook.readingProgress || 0) / 100;
        const pushRes = await windowAPI.pushKoSyncProgress(activeBook.id, 'pos-1', percent);
        if (!isCurrent(token)) return;
        setKoStatus({ success: pushRes.success, message: pushRes.message });
      }
    } catch (e: unknown) {
      if (isCurrent(token)) setKoStatus({ success: false, message: errorMessage(e) });
    } finally {
      if (isCurrent(token)) setIsSyncingKo(false);
    }
  };

  // --- Cloud Storage Handlers ---
  const handleSaveCloudConfig = async () => {
    const token = session.current;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.saveCloudConfig || !savedCloud || loadingConfigs) throw new Error('unavailable');
    await windowAPI.saveCloudConfig(cloudConfig);
    if (!isCurrent(token)) return false;
    setSavedCloud(cloudConfig);
    setCloudStatus({ success: true, message: t('syncSettingsSaved') });
    return true;
  };

  const handleTestCloud = async () => {
    const token = session.current;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.testCloudConnection) return;
    setIsTestingCloud(true);
    setCloudStatus(null);
    try {
      if (!await handleSaveCloudConfig()) return;
      const res = await windowAPI.testCloudConnection(cloudConfig);
      if (!isCurrent(token)) return;
      setCloudStatus({ success: res.success, message: res.message });
    } catch (e: unknown) {
      if (isCurrent(token)) setCloudStatus({ success: false, message: errorMessage(e) });
    } finally {
      if (isCurrent(token)) setIsTestingCloud(false);
    }
  };

  const handleBackupToCloud = async () => {
    const token = session.current;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.backupToCloud) return;
    setIsBackingUpCloud(true);
    setCloudStatus(null);
    try {
      if (!await handleSaveCloudConfig()) return;
      const res = await windowAPI.backupToCloud();
      if (!isCurrent(token)) return;
      setCloudStatus({ success: res.success, message: res.message });
      await loadSnapshots();
    } catch (e: unknown) {
      if (isCurrent(token)) setCloudStatus({ success: false, message: errorMessage(e) });
    } finally {
      if (isCurrent(token)) setIsBackingUpCloud(false);
    }
  };

  const handleListRemoteFiles = async () => {
    const token = session.current;
    if (!savedCloud || dirtyCloud) throw new Error('save-first');
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.listCloudFiles) return;
    setIsLoadingRemoteFiles(true);
    try {
      const files = await windowAPI.listCloudFiles(cloudConfig.remoteBackupFolder);
      if (!isCurrent(token)) return;
      setRemoteFiles(files || []);
    } catch (e) {
      console.error('Failed to list remote files:', e);
    } finally {
      if (isCurrent(token)) setIsLoadingRemoteFiles(false);
    }
  };

  const handleRestoreFromCloud = async (fileName: string) => {
    const token = session.current;
    if (!savedCloud || dirtyCloud) throw new Error('save-first');
    if (!window.confirm(t('snapshotConfirmRestore'))) return;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.restoreFromCloud) return;

    setIsRestoring(true);
    setCloudStatus({ success: true, message: t('snapshotRestoring') });
    try {
      const res = await windowAPI.restoreFromCloud(fileName);
      if (!isCurrent(token)) return;
      setCloudStatus({ success: res.success, message: res.message });
      if (res.success) {
        await refreshBooks();
        await loadSnapshots();
      }
    } catch (e: unknown) {
      if (isCurrent(token)) setCloudStatus({ success: false, message: errorMessage(e) });
    } finally {
      if (isCurrent(token)) setIsRestoring(false);
    }
  };

  // --- Snapshot Handlers ---
  const handleCreateSnapshot = async () => {
    const token = session.current;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.createSnapshot) return;

    setIsCreatingSnapshot(true);
    setSnapshotStatus(null);
    try {
      const res = await windowAPI.createSnapshot(newSnapshotDesc.trim() || undefined);
      if (!isCurrent(token)) return;
      setSnapshotStatus({ success: res.success, message: res.message });
      if (res.success) setNewSnapshotDesc('');
      await loadSnapshots();
    } catch (e: unknown) {
      if (isCurrent(token)) setSnapshotStatus({ success: false, message: errorMessage(e) });
    } finally {
      if (isCurrent(token)) setIsCreatingSnapshot(false);
    }
  };

  const handleRestoreSnapshot = async (fileName: string) => {
    const token = session.current;
    if (!window.confirm(t('snapshotConfirmRestore'))) return;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.restoreSnapshot) return;

    setIsRestoring(true);
    setSnapshotStatus({ success: true, message: t('snapshotRestoring') });
    try {
      const res = await windowAPI.restoreSnapshot(fileName);
      if (!isCurrent(token)) return;
      setSnapshotStatus({ success: res.success, message: res.message });
      if (res.success) {
        await refreshBooks();
      }
    } catch (e: unknown) {
      if (isCurrent(token)) setSnapshotStatus({ success: false, message: errorMessage(e) });
    } finally {
      if (isCurrent(token)) setIsRestoring(false);
    }
  };

  const handleDeleteSnapshot = async (fileName: string) => {
    if (!window.confirm(t('snapshotConfirmDelete'))) return;
    const windowAPI = (window).electronAPI?.cloudSync;
    if (!windowAPI?.deleteSnapshot) return;
    await windowAPI.deleteSnapshot(fileName);
    await loadSnapshots();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" dir={dir}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('cloudSyncModalTitle')} tabIndex={-1} className="relative w-full max-w-4xl max-h-[calc(100dvh-2rem)] bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 flex flex-col overflow-hidden text-stone-900 dark:text-stone-100">
        {confirmDiscard && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div ref={discardRef} role="dialog" aria-modal="true" aria-label={t('unsavedChangesTitle')} tabIndex={-1} className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-4 space-y-3 text-sm leading-relaxed text-main">
            <h4 className="font-bold">{t('unsavedChangesTitle')}</h4><p>{t('settingsDiscardPrompt')}</p>
            <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-lg border border-subtle p-2">{t('keepEditing')}</button><button type="button" onClick={() => { setConfirmDiscard(false); setNewSnapshotDesc(''); onClose(); }} className="rounded-lg bg-red-600 p-2 text-white">{t('discardAndClose')}</button></div>
          </div>
        </div>}
        {operationBusy && <p role="status" className="shrink-0 px-4 py-2 text-xs leading-relaxed">{t('syncOperationBusy')}</p>}
        {operationFailed && <p role="alert" className="shrink-0 px-4 py-2 text-xs text-red-500 leading-relaxed">{t('syncOperationFailed')}</p>}
        {loadFailed && <p role="alert" className="shrink-0 px-4 py-2 text-xs text-red-500 leading-relaxed">{t('syncSettingsLoadFailed')}</p>}
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 dark:text-white">
                {t('cloudSyncModalTitle')}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {t('syncProtocolSummary')}
              </p>
            </div>
          </div>
          <button
            onClick={closeSafely}
            disabled={operationBusy}
            aria-label={t('close')}
            className="p-2 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex shrink-0 overflow-x-auto overscroll-x-contain border-b border-stone-200 dark:border-stone-800 px-3 sm:px-6 bg-stone-100/50 dark:bg-stone-950/40 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          <button
            onClick={() => setActiveTab('koreader')}
            disabled={operationBusy}
            className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition-all ${
              activeTab === 'koreader'
                ? 'border-amber-600 dark:border-amber-400 text-amber-700 dark:text-amber-300 font-semibold'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            {t('tabKOSync')}
          </button>

          <button
            onClick={() => setActiveTab('cloud')}
            disabled={operationBusy}
            className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition-all ${
              activeTab === 'cloud'
                ? 'border-amber-600 dark:border-amber-400 text-amber-700 dark:text-amber-300 font-semibold'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Server className="w-4 h-4" />
            {t('tabCloudStorage')}
          </button>

          <button
            onClick={() => setActiveTab('snapshots')}
            disabled={operationBusy}
            className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition-all ${
              activeTab === 'snapshots'
                ? 'border-amber-600 dark:border-amber-400 text-amber-700 dark:text-amber-300 font-semibold'
                : 'border-transparent text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <History className="w-4 h-4" />
            {t('tabSnapshots')}
            <span className="text-[10px] bg-stone-200 dark:bg-stone-800 px-1.5 py-0.5 rounded-full font-mono">
              {snapshots.length}
            </span>
          </button>
        </div>

        {/* Tab Content */}
        <fieldset disabled={operationBusy || (loadingConfigs && activeTab !== 'snapshots')} className="flex-1 min-w-0 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 space-y-6">
          {loadingConfigs && <p role="status">{t('loading')}</p>}
          {((activeTab === 'koreader' && dirtyKo) || (activeTab === 'cloud' && dirtyCloud)) && <p role="status" className="text-xs leading-relaxed">{t('syncSaveFirst')}</p>}

          {/* TAB 1: KOReader Sync */}
          {activeTab === 'koreader' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-3">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="leading-relaxed">
                  <p className="font-semibold mb-1">KOReader Sync Server (KOSync Protocol)</p>
                  <p>{t('koRegisterNote')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-stone-700 dark:text-stone-300">
                    {t('koServerUrl')}
                  </label>
                  <input
                    type="text"
                    value={koConfig.serverUrl}
                    onChange={(e) => setKoConfig({ ...koConfig, serverUrl: e.target.value })}
                    placeholder="https://sync.koreader.rocks"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-stone-700 dark:text-stone-300">
                    {t('koDeviceName')}
                  </label>
                  <input
                    type="text"
                    value={koConfig.deviceName}
                    onChange={(e) => setKoConfig({ ...koConfig, deviceName: e.target.value })}
                    placeholder="Baglib Desktop"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-stone-700 dark:text-stone-300">
                    {t('koUsername')}
                  </label>
                  <input
                    type="text"
                    value={koConfig.username}
                    onChange={(e) => setKoConfig({ ...koConfig, username: e.target.value })}
                    placeholder="e.g. reader_user"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-stone-700 dark:text-stone-300">
                    {t('koPassword')}
                  </label>
                  <input
                    type="password"
                    value={koConfig.password || ''}
                    onChange={(e) => setKoConfig({ ...koConfig, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="koAutoSync"
                  checked={koConfig.autoSyncOnOpenClose !== false}
                  onChange={(e) => setKoConfig({ ...koConfig, autoSyncOnOpenClose: e.target.checked })}
                  className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="koAutoSync" className="text-xs text-stone-700 dark:text-stone-300 cursor-pointer select-none">
                  {t('koAutoSync')}
                </label>
              </div>

              {koStatus && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                  koStatus.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}>
                  {koStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{koStatus.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-stone-200 dark:border-stone-800">
                <button type="button" data-sync-save-ko disabled={!savedKo} onClick={() => void perform(handleSaveKoConfig)} className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{t('syncSaveSettings')}</button>
                <button
                  onClick={() => void perform(handleTestKo)}
                  disabled={isTestingKo || !koConfig.username || !savedKo}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isTestingKo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {t('koTestConnection')}
                </button>

                {activeBook && (
                  <button
                    onClick={() => void perform(handleManualKoSync)}
                    disabled={isSyncingKo || !koConfig.username || !savedKo || dirtyKo}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSyncingKo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                    {t('koSyncNow')} ({activeBook.title.slice(0, 20)}...)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Multi-Cloud Storage */}
          {activeTab === 'cloud' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-stone-700 dark:text-stone-300">
                    {t('cloudProvider')}
                  </label>
                  <select
                    value={cloudConfig.provider}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, provider: e.target.value as CloudProviderType })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  >
                    <option value="webdav">WebDAV (Standard)</option>
                    <option value="nextcloud">Nextcloud / ownCloud</option>
                    <option value="s3">Amazon S3 / MinIO / Cloudflare R2</option>
                    <option value="dropbox">Dropbox</option>
                    <option value="gdrive">Google Drive</option>
                    <option value="onedrive">Microsoft OneDrive</option>
                    <option value="box">Box</option>
                    <option value="smb">SMB (Windows Share / Samba)</option>
                    <option value="sftp">SFTP (SSH File Transfer)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-stone-700 dark:text-stone-300">
                    {t('cloudFolder')}
                  </label>
                  <input
                    type="text"
                    value={cloudConfig.remoteBackupFolder || 'Baglib/Backups'}
                    onChange={(e) => setCloudConfig({ ...cloudConfig, remoteBackupFolder: e.target.value })}
                    placeholder="Baglib/Backups"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
              </div>

              {/* Dynamic Provider Forms */}
              {(cloudConfig.provider === 'webdav' || cloudConfig.provider === 'nextcloud') && (() => {
                const isNextcloud = cloudConfig.provider === 'nextcloud';
                const currentDav = isNextcloud
                  ? (cloudConfig.nextcloud || { url: '', username: '', password: '' })
                  : (cloudConfig.webdav || { url: '', username: '', password: '' });

                const updateDav = (patch: Partial<typeof currentDav>) => {
                  if (isNextcloud) {
                    setCloudConfig({ ...cloudConfig, nextcloud: { ...currentDav, ...patch } });
                  } else {
                    setCloudConfig({ ...cloudConfig, webdav: { ...currentDav, ...patch } });
                  }
                };

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700/60">
                    <div className="md:col-span-3">
                      <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                        {t('cloudUrl')}
                      </label>
                      <input
                        type="text"
                        value={currentDav.url || ''}
                        onChange={(e) => updateDav({ url: e.target.value })}
                        placeholder={isNextcloud ? 'https://cloud.example.com' : 'https://dav.example.com/remote.php/webdav'}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                        {t('cloudUsername')}
                      </label>
                      <input
                        type="text"
                        value={currentDav.username || ''}
                        onChange={(e) => updateDav({ username: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                        {t('cloudPassword')}
                      </label>
                      <input
                        type="password"
                        value={currentDav.password || ''}
                        onChange={(e) => updateDav({ password: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
                      />
                    </div>
                  </div>
                );
              })()}

              {cloudConfig.provider === 's3' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700/60">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                      {t('cloudS3Endpoint')}
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.s3?.endpoint || ''}
                      onChange={(e) => setCloudConfig({
                        ...cloudConfig,
                        s3: { ...(cloudConfig.s3 || { bucket: '', accessKeyId: '', secretAccessKey: '' }), endpoint: e.target.value },
                      })}
                      placeholder="https://s3.amazonaws.com or https://minio.local"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                      {t('cloudS3Bucket')}
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.s3?.bucket || ''}
                      onChange={(e) => setCloudConfig({
                        ...cloudConfig,
                        s3: { ...(cloudConfig.s3 || { endpoint: '', accessKeyId: '', secretAccessKey: '' }), bucket: e.target.value },
                      })}
                      placeholder="my-baglib-backups"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                      {t('cloudS3AccessKey')}
                    </label>
                    <input
                      type="text"
                      value={cloudConfig.s3?.accessKeyId || ''}
                      onChange={(e) => setCloudConfig({
                        ...cloudConfig,
                        s3: { ...(cloudConfig.s3 || { endpoint: '', bucket: '', secretAccessKey: '' }), accessKeyId: e.target.value },
                      })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                      {t('cloudS3SecretKey')}
                    </label>
                    <input
                      type="password"
                      value={cloudConfig.s3?.secretAccessKey || ''}
                      onChange={(e) => setCloudConfig({
                        ...cloudConfig,
                        s3: { ...(cloudConfig.s3 || { endpoint: '', bucket: '', accessKeyId: '' }), secretAccessKey: e.target.value },
                      })}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                </div>
              )}

              {(cloudConfig.provider === 'dropbox' || cloudConfig.provider === 'gdrive' || cloudConfig.provider === 'onedrive' || cloudConfig.provider === 'box') && (() => {
                const currentToken =
                  cloudConfig.provider === 'dropbox' ? (cloudConfig.dropbox?.token || '') :
                  cloudConfig.provider === 'gdrive' ? (cloudConfig.gdrive?.token || '') :
                  cloudConfig.provider === 'onedrive' ? (cloudConfig.onedrive?.token || '') :
                  cloudConfig.provider === 'box' ? (cloudConfig.box?.token || '') : '';

                const setToken = (token: string) => {
                  if (cloudConfig.provider === 'dropbox') setCloudConfig({ ...cloudConfig, dropbox: { token } });
                  else if (cloudConfig.provider === 'gdrive') setCloudConfig({ ...cloudConfig, gdrive: { token } });
                  else if (cloudConfig.provider === 'onedrive') setCloudConfig({ ...cloudConfig, onedrive: { token } });
                  else if (cloudConfig.provider === 'box') setCloudConfig({ ...cloudConfig, box: { token } });
                };

                return (
                  <div className="p-4 rounded-xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700/60">
                    <label className="block text-xs font-semibold mb-1 text-stone-700 dark:text-stone-300">
                      {t('cloudToken')} ({cloudConfig.provider.toUpperCase()})
                    </label>
                    <input
                      type="password"
                      value={currentToken}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={t('cloudTokenPlaceholder')}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                );
              })()}

              {cloudStatus && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                  cloudStatus.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}>
                  {cloudStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{cloudStatus.message}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-stone-200 dark:border-stone-800">
                <button type="button" data-sync-save-cloud disabled={!savedCloud} onClick={() => void perform(handleSaveCloudConfig)} className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{t('syncSaveSettings')}</button>
                <button
                  onClick={() => void perform(handleTestCloud)}
                  disabled={isTestingCloud || !savedCloud}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isTestingCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {t('cloudTestConnection')}
                </button>

                <button
                  onClick={() => void perform(handleBackupToCloud)}
                  disabled={isBackingUpCloud || !savedCloud}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isBackingUpCloud ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                  {t('cloudBackupNow')}
                </button>

                <button
                  onClick={() => void perform(handleListRemoteFiles)}
                  disabled={isLoadingRemoteFiles || !savedCloud || dirtyCloud}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoadingRemoteFiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
                  {t('cloudBrowseFiles')}
                </button>
              </div>

              {/* Remote Files List */}
              {remoteFiles.length > 0 && (
                <div className="mt-4 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-stone-100 dark:bg-stone-800/60 font-semibold text-xs border-b border-stone-200 dark:border-stone-800">
                    Remote Cloud Files ({remoteFiles.length})
                  </div>
                  <div className="divide-y divide-stone-100 dark:divide-stone-800/60 max-h-48 overflow-y-auto">
                    {remoteFiles.map((file) => (
                      <div key={file.path} className="px-4 py-2.5 text-xs flex items-center justify-between hover:bg-stone-50 dark:hover:bg-stone-800/30">
                        <div className="flex items-center gap-2 overflow-hidden">
                          {file.name.endsWith('.zip') ? <History className="w-4 h-4 text-amber-500 shrink-0" /> : <BookOpen className="w-4 h-4 text-sky-500 shrink-0" />}
                          <span className="font-medium truncate">{file.name}</span>
                          <span className="text-[11px] text-stone-400 font-mono">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        {file.name.endsWith('.zip') && (
                          <button
                            onClick={() => void perform(() => handleRestoreFromCloud(file.name))}
                            disabled={isRestoring || !savedCloud || dirtyCloud}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                          >
                            {t('cloudRestoreBackup')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Snapshots & Safe Rollback */}
          {activeTab === 'snapshots' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Atomic Safe Rollback Guarantee Banner */}
              <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-900/40 text-xs text-teal-800 dark:text-teal-300 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 shrink-0 text-teal-600 dark:text-teal-400 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-semibold mb-0.5">Koodo Reader Safe Rollback Architecture</p>
                  <p>{t('snapshotSafeNotice')}</p>
                </div>
              </div>

              {/* Create Snapshot Bar */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSnapshotDesc}
                  onChange={(e) => setNewSnapshotDesc(e.target.value)}
                  placeholder={t('snapshotDescriptionPlaceholder')}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
                <button
                  onClick={() => void perform(handleCreateSnapshot)}
                  disabled={isCreatingSnapshot}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors flex items-center gap-2 shrink-0 disabled:opacity-50"
                >
                  {isCreatingSnapshot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                  {t('snapshotCreateBtn')}
                </button>
              </div>

              {snapshotStatus && (
                <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                  snapshotStatus.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                }`}>
                  {snapshotStatus.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{snapshotStatus.message}</span>
                </div>
              )}

              {/* Snapshots List */}
              <div className="space-y-3">
                {snapshots.length === 0 ? (
                  <div className="text-center py-10 text-xs text-stone-400 border border-dashed border-stone-200 dark:border-stone-800 rounded-xl">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    {t('snapshotNoSnapshots')}
                  </div>
                ) : (
                  snapshots.map((snap) => (
                    <div
                      key={snap.fileName}
                      className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40 hover:border-amber-500/40 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-stone-900 dark:text-white">
                            {snap.description || snap.fileName}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-700 font-mono">
                            {(snap.sizeBytes / 1024).toFixed(1)} KB
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-400 mt-0.5">
                          {new Date(snap.timestamp).toLocaleString(dir === 'rtl' ? 'ar-EG' : 'en-US')} • {snap.fileName}
                        </p>
                        {snap.stats && (
                          <div className="flex items-center gap-2 mt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                            <span className="bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                              {snap.stats.booksCount} {t('snapshotBooks')}
                            </span>
                            <span className="bg-sky-500/10 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded">
                              {snap.stats.annotationsCount} {t('snapshotAnnotations')}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                          onClick={() => void perform(() => handleRestoreSnapshot(snap.fileName))}
                          disabled={isRestoring}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <DownloadCloud className="w-3.5 h-3.5" />
                          {t('snapshotRestore')}
                        </button>
                        <button
                          onClick={() => void perform(() => handleDeleteSnapshot(snap.fileName))}
                          className="p-1.5 text-stone-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-stone-200 dark:hover:bg-stone-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </fieldset>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-stone-400" />
            <span>{t('syncOfflineScope')}</span>
          </div>
          <button
            onClick={closeSafely}
            disabled={operationBusy}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 transition-colors"
          >
            {t('back')}
          </button>
        </div>

      </div>
    </div>
  );
};
