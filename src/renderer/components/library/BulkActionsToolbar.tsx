'use client';

import React, { useState } from 'react';
import {
  X,
  FolderPlus,
  Tag,
  CheckCircle,
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { BookItem, ReadingStatus } from '../../types/library';
import { CategoryCascader } from '../categories/CategoryCascader';
import { TagEditor } from '../tags/TagEditor';


interface BulkActionsToolbarProps {
  selectedBookIds: string[];
  selectedBooks: BookItem[];
  allCategories: { id: string; nameAr: string; nameEn: string }[];
  onClearSelection: () => void;
  onOperationComplete: (message: string) => void;
  onOpenAudit?: () => void;
  onUndoToast?: (toast: { message: string; onUndo: () => Promise<void> }) => void;
}

export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedBookIds,
  selectedBooks,
  allCategories: _allCategories,
  onClearSelection,
  onOperationComplete,
  onOpenAudit,
  onUndoToast,
}) => {
  const { t, lang, refreshBooks } = useWorkspace();

  // Modals state
  const [activeModal, setActiveModal] = useState<'category' | 'tags' | 'status' | 'delete' | 'enrich' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number; bookTitle?: string; status: string } | null>(null);
  const [enrichResult, setEnrichResult] = useState<{ total: number; updated: number; skipped: number; failed: number } | null>(null);

  // Form states
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [targetStatus, setTargetStatus] = useState<ReadingStatus>('reading');

  if (selectedBookIds.length === 0) return null;

  const count = selectedBookIds.length;

  // Bulk Online Metadata Enrichment with Rate-Limiting
  const handleBulkEnrich = async () => {
    setIsLoading(true);
    setEnrichResult(null);
    setEnrichProgress({ current: 0, total: count, status: 'starting' });

    let unsubscribe: (() => void) | undefined;
    const windowEnrichment = (window)?.electronAPI?.enrichment;
    if (windowEnrichment?.onBulkProgress) {
      unsubscribe = windowEnrichment.onBulkProgress((prog) => {
        setEnrichProgress(prog);
      });
    }

    try {
      if (windowEnrichment?.bulkEnrichWorks) {
        const result = await windowEnrichment.bulkEnrichWorks({
          workIds: selectedBookIds,
        });
        setEnrichResult(result);
        onOperationComplete(
          t('bulkEnrichComplete', {
            updated: result.updated,
            skipped: result.skipped,
            failed: result.failed,
          })
        );
      }
    } catch (err) {
      console.error('Failed to bulk enrich metadata:', err);
    } finally {
      setIsLoading(false);
      if (unsubscribe) {
        unsubscribe();
      }
    }
  };

  // 1. Bulk Category Assignment
  const handleApplyCategory = async () => {
    if (!selectedCategoryId) return;
    setIsLoading(true);
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.bulkUpdateCategory) {
        await window.electronAPI.bulkUpdateCategory({
          workIds: selectedBookIds,
          categoryId: selectedCategoryId,
        });
      }
      setActiveModal(null);
      setSelectedCategoryId('');
      onOperationComplete(t('bulkSuccessToast', { count }));
    } catch (err) {
      console.error('Failed to bulk update category:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Bulk Tags Addition
  const handleApplyTags = async () => {
    if (bulkTags.length === 0) return;

    setIsLoading(true);
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.bulkAddTags) {
        await window.electronAPI.bulkAddTags({
          workIds: selectedBookIds,
          tags: bulkTags,
        });
      }
      setActiveModal(null);
      setBulkTags([]);
      onOperationComplete(t('bulkSuccessToast', { count }));
    } catch (err) {
      console.error('Failed to bulk add tags:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Bulk Reading Status Update
  const handleApplyStatus = async () => {
    setIsLoading(true);
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.bulkUpdateReadingStatus) {
        await window.electronAPI.bulkUpdateReadingStatus({
          workIds: selectedBookIds,
          readingStatus: targetStatus,
          readingProgress: targetStatus === 'completed' ? 100 : (targetStatus === 'unread' ? 0 : 50),
        });
      }
      setActiveModal(null);
      onOperationComplete(t('bulkSuccessToast', { count }));
    } catch (err) {
      console.error('Failed to bulk update reading status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Bulk Export JSON
  const handleBulkExport = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(selectedBooks, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `baglib-export-${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      onOperationComplete(t('bulkSuccessToast', { count }));
    } catch (err) {
      console.error('Failed to export books:', err);
    }
  };

  // 5. Bulk Delete
  const handleConfirmDelete = async () => {
    setIsLoading(true);
    const idsToDelete = [...selectedBookIds];
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.bulkDelete) {
        await window.electronAPI.bulkDelete({ workIds: idsToDelete, permanent: false });
      }
      setActiveModal(null);
      onClearSelection();
      await refreshBooks();
      if (onUndoToast) {
        onUndoToast({
          message: t('booksMovedToTrash', { count: idsToDelete.length }),
          onUndo: async () => {
            if (typeof window !== 'undefined' && window.electronAPI?.bulkRestore) {
              await window.electronAPI.bulkRestore({ workIds: idsToDelete });
              await refreshBooks();
            }
          },
        });
      } else {
        onOperationComplete(t('bulkSuccessToast', { count: idsToDelete.length }));
      }
    } catch (err) {
      console.error('Failed to bulk delete books:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Bottom Toolbar */}
      <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-bottom-5 duration-200">
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 py-2.5 px-4 bg-surface-raised/95 backdrop-blur-xl border border-border/80 shadow-2xl shadow-black/40 rounded-2xl text-xs sm:text-sm">
          {/* Selected Count Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 bg-pale-sky-500/10 border border-pale-sky-500/30 rounded-xl text-pale-sky-500 font-semibold shrink-0">
            <span>{t('batchSelectedCount', { count })}</span>
          </div>

          <div className="h-5 w-[1px] bg-border/60 shrink-0" />

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Category */}
            <button
              onClick={() => setActiveModal('category')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 bg-surface/60 hover:bg-surface text-foreground font-medium transition-all"
            >
              <FolderPlus className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="hidden sm:inline">{t('bulkAssignCategory')}</span>
            </button>

            {/* Tags */}
            <button
              onClick={() => setActiveModal('tags')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 bg-surface/60 hover:bg-surface text-foreground font-medium transition-all"
            >
              <Tag className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="hidden sm:inline">{t('bulkAddTagsBtn')}</span>
            </button>

            {/* Status */}
            <button
              onClick={() => setActiveModal('status')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 bg-surface/60 hover:bg-surface text-foreground font-medium transition-all"
            >
              <CheckCircle className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="hidden sm:inline">{t('bulkChangeStatus')}</span>
            </button>

            {/* Library Metadata Audit & Refresh for Selection */}
            {onOpenAudit && (
              <button
                onClick={onOpenAudit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 dark:text-amber-400 font-semibold transition-all shadow-sm cursor-pointer"
                title={t('auditAndRefreshMetadata')}
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">{t('auditAndRefreshMetadata')}</span>
              </button>
            )}

            {/* Online Metadata Enrichment */}
            <button
              onClick={() => {
                setEnrichResult(null);
                setEnrichProgress(null);
                setActiveModal('enrich');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-medium transition-all"
              title={t('bulkDownloadMetadata')}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t('bulkDownloadMetadata')}</span>
            </button>

            {/* Export */}
            <button
              onClick={handleBulkExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/60 bg-surface/60 hover:bg-surface text-foreground font-medium transition-all"
              title={t('bulkExportData')}
            >
              <Download className="w-4 h-4 text-purple-500 shrink-0" />
              <span className="hidden sm:inline">{t('bulkExportData')}</span>
            </button>

            {/* Delete */}
            <button
              onClick={() => setActiveModal('delete')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-medium transition-all"
              title={t('bulkDeleteBtn')}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{t('bulkDeleteBtn')}</span>
            </button>
          </div>

          <div className="h-5 w-[1px] bg-border/60 shrink-0" />

          {/* Dismiss / Deselect */}
          <button
            onClick={onClearSelection}
            className="p-1.5 rounded-xl hover:bg-surface text-muted hover:text-foreground transition-colors"
            title={t('batchDeselectAll')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. Modal: Assign Category */}
      {activeModal === 'category' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-raised border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-amber-500" />
              <span>{t('bulkCategoryModalTitle', { count })}</span>
            </h3>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                {t('bulkCategorySelectLabel')}
              </label>
              <CategoryCascader
                value={selectedCategoryId || null}
                onChange={(catId) => setSelectedCategoryId(catId || '')}
                placeholder={t('selectCategory')}
                allowClear={false}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl border border-border/60 hover:bg-surface text-xs font-medium text-muted transition-colors"
              >
                {t('bulkCancelBtn')}
              </button>
              <button
                type="button"
                disabled={!selectedCategoryId || isLoading}
                onClick={handleApplyCategory}
                className="flex items-center gap-2 px-4 py-2 bg-pale-sky-500 hover:bg-pale-sky-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('bulkApplyBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Add Tags */}
      {activeModal === 'tags' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-raised border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Tag className="w-5 h-5 text-emerald-500" />
              <span>{t('bulkTagsModalTitle', { count })}</span>
            </h3>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                {t('bulkTagsInputLabel')}
              </label>
              <TagEditor
                value={bulkTags}
                onChange={setBulkTags}
                placeholder={t('addTagPlaceholder')}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl border border-border/60 hover:bg-surface text-xs font-medium text-muted transition-colors"
              >
                {t('bulkCancelBtn')}
              </button>
              <button
                type="button"
                disabled={bulkTags.length === 0 || isLoading}
                onClick={handleApplyTags}
                className="flex items-center gap-2 px-4 py-2 bg-pale-sky-500 hover:bg-pale-sky-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('bulkApplyBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Change Reading Status */}
      {activeModal === 'status' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-raised border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-500" />
              <span>{t('bulkStatusModalTitle', { count })}</span>
            </h3>

            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                {t('bulkStatusSelectLabel')}
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as ReadingStatus)}
                className="w-full bg-surface border border-border/80 text-foreground rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-pale-sky-500 outline-none"
              >
                <option value="unread">{t('statusUnread')}</option>
                <option value="reading">{t('statusReading')}</option>
                <option value="completed">{t('statusCompleted')}</option>
                <option value="paused">{lang === 'ar' ? 'متوقف مؤقتاً' : 'Paused'}</option>
                <option value="abandoned">{lang === 'ar' ? 'متروك' : 'Abandoned'}</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl border border-border/60 hover:bg-surface text-xs font-medium text-muted transition-colors"
              >
                {t('bulkCancelBtn')}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleApplyStatus}
                className="flex items-center gap-2 px-4 py-2 bg-pale-sky-500 hover:bg-pale-sky-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('bulkApplyBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: Bulk Delete Confirmation */}
      {activeModal === 'delete' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-raised border border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>{t('bulkDeleteConfirmTitle', { count })}</span>
            </h3>

            <p className="text-xs text-muted leading-relaxed">
              {t('bulkDeleteConfirmDesc')}
            </p>

            <div className="max-h-36 overflow-y-auto bg-surface/60 border border-border/60 rounded-xl p-2.5 text-xs space-y-1">
              {selectedBooks.slice(0, 10).map((b) => (
                <div key={b.id} className="text-foreground/80 truncate">
                  • {b.title}
                </div>
              ))}
              {selectedBooks.length > 10 && (
                <div className="text-muted italic pt-1">
                  +{selectedBooks.length - 10} {lang === 'ar' ? 'عناصر أخرى...' : 'more items...'}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl border border-border/60 hover:bg-surface text-xs font-medium text-muted transition-colors"
              >
                {t('bulkCancelBtn')}
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleConfirmDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{t('bulkDeleteBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal: Bulk Download Online Metadata */}
      {activeModal === 'enrich' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-surface-raised border border-border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-sky-400" />
              <span>{t('bulkEnrichModalTitle', { count })}</span>
            </h3>

            <p className="text-xs text-muted leading-relaxed">
              {t('bulkDownloadMetadataDesc')}
            </p>

            {enrichProgress && (
              <div className="space-y-2 bg-surface/70 border border-border/60 rounded-xl p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground font-medium">
                    {t('bulkEnrichProgress', {
                      current: enrichProgress.current,
                      total: enrichProgress.total,
                    })}
                  </span>
                  <span className="text-muted">
                    {Math.round((enrichProgress.current / (enrichProgress.total || 1)) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-border/40 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-sky-500 h-full transition-all duration-300"
                    style={{
                      width: `${Math.round((enrichProgress.current / (enrichProgress.total || 1)) * 100)}%`,
                    }}
                  />
                </div>
                {enrichProgress.bookTitle && (
                  <div className="text-[11px] text-muted truncate">
                    {enrichProgress.bookTitle}
                  </div>
                )}
              </div>
            )}

            {enrichResult && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {t('bulkEnrichComplete', {
                      updated: enrichResult.updated,
                      skipped: enrichResult.skipped,
                      failed: enrichResult.failed,
                    })}
                  </span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-xl border border-border/60 hover:bg-surface text-xs font-medium text-muted transition-colors disabled:opacity-50"
              >
                {enrichResult ? (lang === 'ar' ? 'إغلاق' : 'Close') : t('bulkCancelBtn')}
              </button>
              {!enrichResult && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleBulkEnrich}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
                >
                  {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{lang === 'ar' ? 'بدء التنزيل' : 'Start Download'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
