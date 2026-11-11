'use client';
import { useProgressFeedback } from '../../hooks/useProgressFeedback';
import { useToast } from '../ui/Toast';
import { errorMessage } from '../../../shared/errors';


import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  HardDrive,
  RefreshCw,
  FolderSearch,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Unplug,
  Copy,
  ExternalLink,
  Link2,
  Trash2,
  Search,
  X,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type {
  StorageHealthSummary,
  StorageAnalytics,
  BatchRebindResult,
  BookItem,
} from '../../types/library';

export interface StorageManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'all' | 'missing' | 'duplicates' | 'healthy';
  books?: BookItem[];
  onRemoveDuplicate?: (id: string) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const StorageManagerModal: React.FC<StorageManagerModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'all',
  onRemoveDuplicate,
}) => {
  const { t, dir, refreshBooks } = useWorkspace();
  const isRtl = dir === 'rtl';

  const [activeTab, setActiveTab] = useState<'all' | 'missing' | 'duplicates' | 'healthy'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [summary, setSummary] = useState<StorageHealthSummary | null>(null);
  const [analytics, setAnalytics] = useState<StorageAnalytics | null>(null);
  const { showToast: notify } = useToast();

  // Batch rebind state
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchRebindResult | null>(null);

  // Prune confirmation state
  const [pruneTarget, setPruneTarget] = useState<{
    primaryWorkId: string;
    duplicateWorkId: string;
    duplicateTitle: string;
    duplicatePath: string;
  } | null>(null);
  const [deletePhysicalFile, setDeletePhysicalFile] = useState(false);
  const repairActive = useRef(false);
  const [isRepairing, setIsRepairing] = useState(false);
  useProgressFeedback(isRepairing || isAuditing || isBatchScanning, t('storageOperationInProgress'));
  const closeSafely = () => {
    if (!repairActive.current && !isAuditing && !isBatchScanning) onClose();
  };
  const dialogRef = useDialogFocus(isOpen, closeSafely);
  const resultRef = useDialogFocus(isOpen && !!batchResult, () => { if (!repairActive.current) setBatchResult(null); });
  const pruneRef = useDialogFocus(isOpen && !!pruneTarget, () => { if (!repairActive.current) setPruneTarget(null); });

  // Sync tab if initialTab changes
  const [previousResetInputs1, setPreviousResetInputs1] = useState<readonly unknown[] | null>(null);
  const resetInputs1 = [initialTab];
  if (previousResetInputs1 === null || resetInputs1.some((value, index) => !Object.is(value, previousResetInputs1[index]))) {
    setPreviousResetInputs1(resetInputs1);

    if (initialTab) {
      setActiveTab(initialTab);
    }

  }

  const loadData = async (triggerDeepAudit = false) => {
    if (typeof window === 'undefined' || !window.electronAPI) return;
    setIsLoading(true);
    if (triggerDeepAudit) setIsAuditing(true);

    try {
      const api = window.electronAPI;
      const [sumRes, anaRes] = await Promise.all([
        triggerDeepAudit && api.storage?.verifyAll
          ? api.storage.verifyAll()
          : api.storage?.getHealthSummary
          ? api.storage.getHealthSummary()
          : api.verifyAllFilesStorage
          ? api.verifyAllFilesStorage()
          : null,
        api.storage?.getAnalytics ? api.storage.getAnalytics() : null,
      ]);

      if (sumRes) setSummary(sumRes);
      if (anaRes) setAnalytics(anaRes);
    } catch (err) {
      console.error('Failed to load storage health:', err);
    } finally {
      setIsLoading(false);
      setIsAuditing(false);
    }
  };

  const [previousStorageVisibility, setPreviousStorageVisibility] = useState<readonly unknown[] | null>(null);
  const inputsStorageVisibility = [isOpen];
  if (previousStorageVisibility === null || inputsStorageVisibility.some((value, index) => !Object.is(value, previousStorageVisibility[index]))) {
    setPreviousStorageVisibility(inputsStorageVisibility);
    if (isOpen) setIsLoading(true);
  }
  useEffect(() => {
    if (isOpen) {
      let alive = true;
      const storage = window.electronAPI.storage;
      void Promise.all([storage.getHealthSummary(), storage.getAnalytics()]).then(([summary, analytics]) => {
        if (alive) { if (summary) setSummary(summary); if (analytics) setAnalytics(analytics); }
      }).catch(console.warn).finally(() => { if (alive) setIsLoading(false); });
      return () => { alive = false; };
    }
  }, [isOpen]);

  const showToast = (message: string) => { notify({ message }); };

  // Single-file locate / re-link handler
  const handleLocateFile = async (workId: string) => {
    const api = window.electronAPI;
    if (!api?.openFileDialog || !api?.storage?.relinkFile) return;
    if (repairActive.current) return;
    repairActive.current = true;
    setIsRepairing(true);

    try {
      const newPath = await api.openFileDialog();
      if (!newPath) return;

      const res = await api.storage.relinkFile(workId, newPath);
      if (res.success) {
        showToast(t('storageLocateSuccess'));
        await loadData(false);
        refreshBooks();
      } else {
        showToast(t('storageLocateError', { error: res.error || '' }));
      }
    } catch (err: unknown) {
      showToast(t('storageLocateError', { error: errorMessage(err) || '' }));
    } finally {
      repairActive.current = false;
      setIsRepairing(false);
    }
  };

  // Re-verify single item
  const handleVerifySingle = async (workId: string) => {
    const api = window.electronAPI;
    if (!api?.storage?.verifyFile) return;
    if (repairActive.current) return;
    repairActive.current = true;
    setIsRepairing(true);

    try {
      await api.storage.verifyFile(workId);
      await loadData(false);
      refreshBooks();
    } catch (err) {
      console.error('Failed single verification:', err);
    } finally {
      repairActive.current = false;
      setIsRepairing(false);
    }
  };

  // Reveal in OS File Explorer
  const handleReveal = (filePath?: string) => {
    if (!filePath) return;
    const api = window.electronAPI;
    if (api?.showItemInFolder) {
      api.showItemInFolder(filePath);
    }
  };

  // Batch auto-rebind folder scan
  const handleStartBatchRebind = async () => {
    const api = window.electronAPI;
    if (!api?.openDirectoryDialog || !api?.storage?.batchAutoRebind) return;
    if (repairActive.current) return;
    repairActive.current = true;
    setIsRepairing(true);

    try {
      const folderPath = await api.openDirectoryDialog();
      if (!folderPath) return;

      setIsBatchScanning(true);
      const res = await api.storage.batchAutoRebind(folderPath);
      setBatchResult(res);
      await loadData(false);
      refreshBooks();
    } catch (err) {
      console.error('Failed batch auto-rebind:', err);
    } finally {
      repairActive.current = false;
      setIsRepairing(false);
      setIsBatchScanning(false);
    }
  };

  // Prune duplicate action
  const handleConfirmPrune = async () => {
    if (!pruneTarget) return;
    if (repairActive.current) return;
    repairActive.current = true;
    setIsRepairing(true);
    const api = window.electronAPI;

    try {
      if (api?.storage?.pruneDuplicate) {
        const res = await api.storage.pruneDuplicate({
          primaryWorkId: pruneTarget.primaryWorkId,
          duplicateWorkId: pruneTarget.duplicateWorkId,
          deleteFileFromDisk: deletePhysicalFile,
        });

        if (res.success) {
          showToast(isRtl ? 'تم حذف النسخة المكررة بنجاح' : 'Duplicate copy removed successfully');
          setPruneTarget(null);
          await loadData(false);
          refreshBooks();
          return;
        }
      }

      if (onRemoveDuplicate) {
        await onRemoveDuplicate(pruneTarget.duplicateWorkId);
        showToast(isRtl ? 'تم حذف النسخة المكررة بنجاح' : 'Duplicate copy removed successfully');
        setPruneTarget(null);
        await loadData(false);
        refreshBooks();
      }
    } catch (err: unknown) {
      showToast(errorMessage(err) || (isRtl ? 'خطأ أثناء الحذف' : 'Error pruning duplicate'));
    } finally {
      repairActive.current = false;
      setIsRepairing(false);
    }
  };

  // Filtered items based on tab & search
  const filteredItems = useMemo(() => {
    if (!summary?.items) return [];

    return summary.items.filter((item) => {
      // Tab filter
      if (activeTab === 'missing') {
        if (item.status !== 'missing' && item.status !== 'unmounted' && item.status !== 'corrupted') {
          return false;
        }
      } else if (activeTab === 'duplicates') {
        if (!item.isDuplicate) return false;
      } else if (activeTab === 'healthy') {
        if (item.status !== 'available') return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesPath = item.filePath?.toLowerCase().includes(q);
        const matchesAuthor = item.author?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesPath && !matchesAuthor) return false;
      }

      return true;
    });
  }, [summary, activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('storageManagerTitle')}
        tabIndex={-1}
        className="relative flex flex-col w-full max-w-5xl h-[88dvh] max-h-[calc(100dvh-2rem)] bg-surface-base dark:bg-zinc-900 border border-border-base dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
        style={{ textAlign: 'start' }}
      >
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3 border-b border-border-base dark:border-zinc-800 bg-surface-raised dark:bg-zinc-900/90 [&>div:first-child]:basis-full sm:[&>div:first-child]:basis-auto [&_p]:hidden sm:[&_p]:block">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary dark:text-zinc-100">
                {t('storageManagerTitle')}
              </h2>
              <p className="text-xs text-text-muted dark:text-zinc-400">
                {t('storageManagerDesc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(true)}
              disabled={isAuditing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border-base dark:border-zinc-700 bg-surface-base dark:bg-zinc-800 text-text-secondary dark:text-zinc-200 hover:bg-surface-raised dark:hover:bg-zinc-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin text-primary-500' : ''}`} />
              <span>{isAuditing ? t('storageAuditing') : t('storageAuditBtn')}</span>
            </button>

            <button
              onClick={handleStartBatchRebind}
              disabled={isBatchScanning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition disabled:opacity-50"
            >
              <FolderSearch className="w-3.5 h-3.5" />
              <span>{t('storageAutoRebindBtn')}</span>
            </button>

            <button
              onClick={closeSafely}
              disabled={isRepairing || isAuditing || isBatchScanning}
              aria-label={t('close')}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-base dark:hover:bg-zinc-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Storage Metrics Banner */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 p-3 sm:p-6 max-h-[20%] sm:max-h-[28%] shrink-0 overflow-y-auto overscroll-contain border-b border-border-base dark:border-zinc-800 bg-surface-base dark:bg-zinc-900/50">
          {/* Total Used Footprint */}
          <div className="p-3 rounded-xl border border-border-base dark:border-zinc-800 bg-surface-raised dark:bg-zinc-800/40">
            <span className="text-[11px] font-medium text-text-muted dark:text-zinc-400">
              {t('storageTotalFootprint')}
            </span>
            <div className="mt-1 text-lg font-bold text-text-primary dark:text-zinc-100">
              {formatBytes(summary?.totalSizeBytes)}
            </div>
            <span className="text-[10px] text-text-muted dark:text-zinc-500">
              {summary?.totalDigitalWorks ?? 0} {t('bookSingle')}
            </span>
          </div>

          {/* Healthy Files */}
          <div
            onClick={() => setActiveTab('healthy')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              activeTab === 'healthy'
                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                : 'border-border-base dark:border-zinc-800 bg-surface-raised dark:bg-zinc-800/40 hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
              <span className="text-[11px] font-medium">{t('storageStatusHealthy')}</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-300">
              {summary?.availableFiles ?? 0}
            </div>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
              {summary?.totalFiles ? Math.round(((summary.availableFiles || 0) / summary.totalFiles) * 100) : 0}%
            </span>
          </div>

          {/* Missing Files */}
          <div
            onClick={() => setActiveTab('missing')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              activeTab === 'missing'
                ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30'
                : 'border-border-base dark:border-zinc-800 bg-surface-raised dark:bg-zinc-800/40 hover:border-rose-300'
            }`}
          >
            <div className="flex items-center justify-between text-rose-600 dark:text-rose-400">
              <span className="text-[11px] font-medium">{t('storageStatusMissing')}</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 text-lg font-bold text-rose-700 dark:text-rose-300">
              {summary?.missingFiles ?? 0}
            </div>
            <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80">
              {isRtl ? 'يحتاج إعادة ربط' : 'Requires re-link'}
            </span>
          </div>

          {/* Unmounted Drives */}
          <div
            onClick={() => setActiveTab('missing')}
            className="p-3 rounded-xl border border-border-base dark:border-zinc-800 bg-surface-raised dark:bg-zinc-800/40 cursor-pointer hover:border-amber-300 transition"
          >
            <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
              <span className="text-[11px] font-medium">{t('storageStatusUnmounted')}</span>
              <Unplug className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 text-lg font-bold text-amber-700 dark:text-amber-300">
              {summary?.unmountedFiles ?? 0}
            </div>
            <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80">
              {isRtl ? 'قرص مفصول' : 'Drive detached'}
            </span>
          </div>

          {/* Corrupted Files */}
          <div
            onClick={() => setActiveTab('missing')}
            className="p-3 rounded-xl border border-border-base dark:border-zinc-800 bg-surface-raised dark:bg-zinc-800/40 cursor-pointer hover:border-orange-300 transition"
          >
            <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
              <span className="text-[11px] font-medium">{t('storageStatusCorrupted')}</span>
              <XCircle className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 text-lg font-bold text-orange-700 dark:text-orange-300">
              {summary?.corruptedFiles ?? 0}
            </div>
            <span className="text-[10px] text-orange-600/80 dark:text-orange-400/80">
              {isRtl ? '0 بايت / بصمة غير مطابقة' : '0-byte or bad hash'}
            </span>
          </div>

          {/* Duplicates & Reclaimable */}
          <div
            onClick={() => setActiveTab('duplicates')}
            className={`p-3 rounded-xl border cursor-pointer transition ${
              activeTab === 'duplicates'
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                : 'border-border-base dark:border-zinc-800 bg-surface-raised dark:bg-zinc-800/40 hover:border-purple-300'
            }`}
          >
            <div className="flex items-center justify-between text-purple-600 dark:text-purple-400">
              <span className="text-[11px] font-medium">{t('storageStatusDuplicate')}</span>
              <Copy className="w-3.5 h-3.5" />
            </div>
            <div className="mt-1 text-lg font-bold text-purple-700 dark:text-purple-300">
              {summary?.duplicateFiles ?? 0}
            </div>
            <span className="text-[10px] text-purple-600/80 dark:text-purple-400/80">
              {formatBytes(summary?.reclaimableSizeBytes)} {isRtl ? 'مهدور' : 'wasted'}
            </span>
          </div>
        </div>

        {/* Toolbar & Filter Tabs */}
        <div className="flex shrink-0 flex-col sm:flex-row items-center justify-between gap-2 px-3 sm:px-6 py-2 border-b border-border-base dark:border-zinc-800 bg-surface-raised/40 dark:bg-zinc-900/30">
          {/* Tabs */}
          <div className="flex max-w-full overflow-x-auto overscroll-x-contain items-center gap-1.5 p-1 rounded-xl bg-surface-base dark:bg-zinc-800/80 border border-border-base dark:border-zinc-700/60 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'all'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {t('storageTabAll')} ({summary?.items?.length ?? 0})
            </button>

            <button
              onClick={() => setActiveTab('missing')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'missing'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {t('storageTabMissing')} ({(summary?.missingFiles ?? 0) + (summary?.unmountedFiles ?? 0) + (summary?.corruptedFiles ?? 0)})
            </button>

            <button
              onClick={() => setActiveTab('duplicates')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'duplicates'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {t('storageTabDuplicates')} ({summary?.duplicateFiles ?? 0})
            </button>

            <button
              onClick={() => setActiveTab('healthy')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === 'healthy'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              {t('storageTabHealthy')} ({summary?.availableFiles ?? 0})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('storageSearchPaths')}
              aria-label={t('storageSearchPaths')}
              className="w-full py-1.5 ps-9 pe-3 text-xs rounded-xl border border-border-base dark:border-zinc-700 bg-surface-base dark:bg-zinc-800 text-text-primary dark:text-zinc-100 placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label={t('searchClearQuery')}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div data-storage-results className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 space-y-4">
          {/* Toast Notification */}

          {/* Duplicate Groups View when Tab is Duplicates */}
          {activeTab === 'duplicates' && analytics?.duplicateGroups && analytics.duplicateGroups.length > 0 ? (
            <div className="space-y-4">
              {analytics.duplicateGroups.map((group, gIdx) => (
                <div
                  key={group.hash || gIdx}
                  className="p-4 rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/10 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Copy className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-xs font-bold text-text-primary dark:text-zinc-200">
                        {isRtl ? 'مجموعة مكررة' : 'Duplicate Cluster'}: {group.count} {isRtl ? 'نسخ' : 'copies'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-mono">
                        {formatBytes(group.fileSizeBytes)}
                      </span>
                    </div>
                    <span className="text-xs text-purple-700 dark:text-purple-300 font-medium">
                      {isRtl ? 'مساحة مهدورة:' : 'Wasted space:'} {formatBytes(group.wastedBytes)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {group.items.map((it) => (
                      <div
                        key={it.workId}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs ${
                          it.isPrimary
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                            : 'bg-surface-base dark:bg-zinc-800/60 border-border-base dark:border-zinc-700/60'
                        }`}
                      >
                        <div className="flex-1 min-w-0 me-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-primary dark:text-zinc-200 truncate">
                              {it.title}
                            </span>
                            {it.isPrimary && (
                              <span className="px-1.5 py-0.5 text-[9px] rounded font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                                {isRtl ? 'النسخة الأصلية' : 'Primary Master'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-text-muted dark:text-zinc-400 truncate font-mono mt-0.5">
                            {it.filePath}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleReveal(it.filePath)}
                            className="p-1.5 rounded-lg border border-border-base dark:border-zinc-700 text-text-muted hover:text-text-primary hover:bg-surface-raised"
                            title={t('storageActionReveal')}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          {!it.isPrimary && (
                            <button
                              onClick={() => {
                                const primary = group.items.find((x) => x.isPrimary) || group.items[0];
                                setPruneTarget({
                                  primaryWorkId: primary.workId,
                                  duplicateWorkId: it.workId,
                                  duplicateTitle: it.title,
                                  duplicatePath: it.filePath,
                                });
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-800 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{t('storageActionPrune')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3 opacity-80" />
              <h3 className="text-sm font-semibold text-text-primary dark:text-zinc-200">
                {isRtl ? 'لا توجد عناصر مطابقة في هذا التصنيف' : 'No matching files in this category'}
              </h3>
              <p className="text-xs text-text-muted dark:text-zinc-400 max-w-sm mt-1">
                {activeTab === 'missing'
                  ? isRtl ? 'جميع ملفات المكتبة متوفرة وسليمة على القرص!' : 'All library files are present and healthy on disk!'
                  : isRtl ? 'لا توجد نتائج مطابقة لخيارات البحث المحددة.' : 'No items match your active search filters.'}
              </p>
            </div>
          ) : (
            <div className="border border-border-base dark:border-zinc-800 rounded-xl overflow-hidden bg-surface-base dark:bg-zinc-900">
              <table className="w-full text-xs text-start">
                <thead className="bg-surface-raised dark:bg-zinc-800/80 border-b border-border-base dark:border-zinc-800 text-text-muted dark:text-zinc-400">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">{t('storageColTitle')}</th>
                    <th className="py-2.5 px-3 font-semibold">{t('storageColFormat')}</th>
                    <th className="py-2.5 px-3 font-semibold">{t('storageColSize')}</th>
                    <th className="py-2.5 px-3 font-semibold">{t('storageColStatus')}</th>
                    <th className="py-2.5 px-3 font-semibold">{t('storageColPath')}</th>
                    <th className="py-2.5 px-4 font-semibold text-end">{t('storageColActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-base dark:divide-zinc-800/60">
                  {filteredItems.map((item) => {
                    const isMissing = item.status === 'missing';
                    const isUnmounted = item.status === 'unmounted';
                    const isCorrupted = item.status === 'corrupted';

                    return (
                      <tr
                        key={item.workId}
                        className={`hover:bg-surface-raised/60 dark:hover:bg-zinc-800/40 transition ${
                          isMissing || isUnmounted || isCorrupted ? 'bg-rose-50/20 dark:bg-rose-950/10' : ''
                        }`}
                      >
                        {/* Title & Author */}
                        <td className="py-3 px-4 min-w-[200px]">
                          <div className="font-semibold text-text-primary dark:text-zinc-100">
                            {item.title}
                          </div>
                          {item.author && (
                            <div className="text-[11px] text-text-muted dark:text-zinc-400">
                              {item.author}
                            </div>
                          )}
                        </td>

                        {/* Format */}
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-surface-raised dark:bg-zinc-800 border border-border-base dark:border-zinc-700 text-text-secondary dark:text-zinc-300">
                            {item.format || 'FILE'}
                          </span>
                        </td>

                        {/* Size */}
                        <td className="py-3 px-3 font-mono text-text-secondary dark:text-zinc-300">
                          {formatBytes(item.fileSizeBytes)}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-3">
                          {item.status === 'available' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{t('storageStatusHealthy')}</span>
                            </span>
                          )}

                          {isMissing && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                              <AlertTriangle className="w-3 h-3" />
                              <span>{t('storageStatusMissing')}</span>
                            </span>
                          )}

                          {isUnmounted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                              <Unplug className="w-3 h-3" />
                              <span>{t('storageStatusUnmounted')}</span>
                            </span>
                          )}

                          {isCorrupted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300">
                              <XCircle className="w-3 h-3" />
                              <span>{t('storageStatusCorrupted')}</span>
                            </span>
                          )}
                        </td>

                        {/* File Path */}
                        <td className="py-3 px-3 max-w-xs">
                          <div
                            className="font-mono text-[11px] text-text-muted dark:text-zinc-400 truncate"
                            title={item.filePath}
                          >
                            {item.filePath || '—'}
                          </div>
                          {item.errorReason && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                              {item.errorReason}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            {(isMissing || isUnmounted || isCorrupted) ? (
                              <button
                                onClick={() => handleLocateFile(item.workId)}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition"
                              >
                                <Link2 className="w-3.5 h-3.5" />
                                <span>{t('storageActionLocate')}</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReveal(item.filePath)}
                                className="p-1.5 rounded-lg border border-border-base dark:border-zinc-700 text-text-muted hover:text-text-primary hover:bg-surface-raised transition"
                                title={t('storageActionReveal')}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              onClick={() => handleVerifySingle(item.workId)}
                              className="p-1.5 rounded-lg border border-border-base dark:border-zinc-700 text-text-muted hover:text-text-primary hover:bg-surface-raised transition"
                              title={t('storageActionVerify')}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border-base dark:border-zinc-800 bg-surface-raised dark:bg-zinc-900/90 text-xs text-text-muted dark:text-zinc-400">
          <div>
            {t('metricTotal')}: <strong className="text-text-primary dark:text-zinc-200">{summary?.totalFiles ?? 0}</strong>
          </div>
          <button
            onClick={closeSafely}
            disabled={isRepairing || isAuditing || isBatchScanning}
            className="px-4 py-1.5 rounded-lg border border-border-base dark:border-zinc-700 font-medium hover:bg-surface-base dark:hover:bg-zinc-800 text-text-primary dark:text-zinc-200 transition"
          >
            {isRtl ? 'إغلاق' : 'Close'}
          </button>
        </div>

        {/* Batch Re-bind Results Dialog */}
        {batchResult && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div ref={resultRef} role="dialog" aria-modal="true" aria-label={t('storageBatchScanTitle')} tabIndex={-1} className="w-full max-w-lg p-6 rounded-2xl bg-surface-base dark:bg-zinc-900 border border-border-base dark:border-zinc-800 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                  <FolderSearch className="w-5 h-5" />
                  <h3 className="font-bold text-sm text-text-primary dark:text-zinc-100">
                    {t('storageBatchScanTitle')}
                  </h3>
                </div>
                <button
                  onClick={() => setBatchResult(null)}
                  className="p-1 rounded-lg text-text-muted hover:text-text-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-surface-raised dark:bg-zinc-800/60 border border-border-base dark:border-zinc-700 text-xs space-y-1">
                <div>
                  {isRtl ? 'الملفات المفحوصة:' : 'Files Scanned:'} <strong>{batchResult.scannedFilesCount}</strong>
                </div>
                <div className="text-emerald-600 dark:text-emerald-400">
                  {isRtl ? 'الملفات التي تمت معالجتها وربطها:' : 'Successfully Re-linked:'} <strong>{batchResult.resolvedCount}</strong>
                </div>
                <div className="text-text-muted">
                  {isRtl ? 'ملفات متبقية لم يتم العثور عليها:' : 'Remaining Missing:'} <strong>{batchResult.unresolvedCount}</strong>
                </div>
              </div>

              {batchResult.matches.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-text-primary dark:text-zinc-300">
                    {t('storageBatchScanMatchedList')}
                  </span>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-lg bg-surface-raised/40 dark:bg-zinc-800/40 border border-border-base dark:border-zinc-800">
                    {batchResult.matches.map((m) => (
                      <div key={m.workId} className="flex items-center justify-between text-[11px] p-1.5 rounded bg-surface-base dark:bg-zinc-800">
                        <span className="font-medium text-text-primary dark:text-zinc-200 truncate me-2">
                          {m.title}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono">
                          {m.matchType === 'hash' ? '100% Hash' : `${Math.round(m.confidence * 100)}% Name`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => setBatchResult(null)}
                className="w-full py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold transition"
              >
                {isRtl ? 'موافق ومتابعة' : 'Accept & Continue'}
              </button>
            </div>
          </div>
        )}

        {/* Prune Confirmation Dialog */}
        {pruneTarget && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div ref={pruneRef} role="dialog" aria-modal="true" aria-label={t('storageActionPrune')} tabIndex={-1} className="w-full max-w-md p-6 rounded-2xl bg-surface-base dark:bg-zinc-900 border border-border-base dark:border-zinc-800 shadow-2xl space-y-4">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                <Trash2 className="w-5 h-5" />
                <h3 className="font-bold text-sm text-text-primary dark:text-zinc-100">
                  {t('storageActionPrune')}
                </h3>
              </div>

              <p className="text-xs text-text-secondary dark:text-zinc-300">
                {t('storagePruneConfirm')}
              </p>

              <div className="p-3 rounded-xl bg-surface-raised dark:bg-zinc-800/60 border border-border-base dark:border-zinc-700 text-xs font-mono truncate">
                {pruneTarget.duplicateTitle}
                <div className="text-[10px] text-text-muted mt-0.5 truncate">
                  {pruneTarget.duplicatePath}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-text-primary dark:text-zinc-200 select-none">
                <input
                  type="checkbox"
                  checked={deletePhysicalFile}
                  onChange={(e) => setDeletePhysicalFile(e.target.checked)}
                  className="rounded border-border-base text-rose-600 focus:ring-rose-500"
                />
                <span>{t('storagePruneAlsoDeleteFile')}</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setPruneTarget(null)}
                  disabled={isRepairing}
                  className="px-4 py-1.5 rounded-lg border border-border-base dark:border-zinc-700 text-xs font-medium hover:bg-surface-raised text-text-primary dark:text-zinc-200 transition"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleConfirmPrune}
                  disabled={isRepairing}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  {isRtl ? 'تأكيد الحذف' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
