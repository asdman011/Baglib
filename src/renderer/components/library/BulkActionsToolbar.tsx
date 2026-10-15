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
}

export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedBookIds,
  selectedBooks,
  allCategories,
  onClearSelection,
  onOperationComplete,
}) => {
  const { t, lang, dir } = useWorkspace();

  // Modals state
  const [activeModal, setActiveModal] = useState<'category' | 'tags' | 'status' | 'delete' | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [bulkTags, setBulkTags] = useState<string[]>([]);
  const [targetStatus, setTargetStatus] = useState<ReadingStatus>('reading');

  if (selectedBookIds.length === 0) return null;

  const count = selectedBookIds.length;

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
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.bulkDelete) {
        await window.electronAPI.bulkDelete({ workIds: selectedBookIds });
      }
      setActiveModal(null);
      onClearSelection();
      onOperationComplete(t('bulkSuccessToast', { count }));
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
    </>
  );
};
