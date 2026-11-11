'use client';
import { useToast } from '../ui/Toast';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Calendar,
  CheckSquare,
  Square,
  BookOpen
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { BookItem } from '../../types/library';
import { Modal } from '../ui/Modal';

interface TrashBinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored?: () => void;
}

export const TrashBinModal: React.FC<TrashBinModalProps> = ({
  isOpen,
  onClose,
  onRestored,
}) => {
  const { t, dir, lang, refreshBooks } = useWorkspace();
  const [trashBooks, setTrashBooks] = useState<BookItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const [confirmPermanentId, setConfirmPermanentId] = useState<string | null>(null);
  const [confirmPermanentBulk, setConfirmPermanentBulk] = useState(false);
  const { showToast: notify } = useToast();

  const showToast = (message: string) => { notify({ message }); };

  const loadTrash = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.getTrashWorks) return;
    try {
      const items = await window.electronAPI.getTrashWorks();
      setTrashBooks(Array.isArray(items) ? (items as BookItem[]) : []);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('[baglib/trash-modal] Failed to load trash:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    if (typeof window !== 'undefined' && window.electronAPI?.getTrashWorks) {
      window.electronAPI.getTrashWorks().then((items) => {
        if (!alive) return;
        setTrashBooks(Array.isArray(items) ? (items as BookItem[]) : []);
        setSelectedIds(new Set());
      }).catch((err) => {
        console.error('[baglib/trash-modal] Failed to load trash:', err);
      }).finally(() => {
        if (alive) setLoading(false);
      });
    }
    return () => {
      alive = false;
    };
  }, [isOpen]);


  if (!isOpen) return null;

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === trashBooks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trashBooks.map((b) => b.id)));
    }
  };

  const handleRestoreSingle = async (book: BookItem) => {
    if (actionLoading || typeof window === 'undefined' || !window.electronAPI?.restoreBook) return;
    setActionLoading(true);
    try {
      await window.electronAPI.restoreBook(book.id);
      showToast(t('bookRestored'));
      await loadTrash();
      await refreshBooks();
      onRestored?.();
    } catch (err) {
      console.error('[baglib/trash-modal] Failed to restore book:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestoreSelected = async () => {
    if (selectedIds.size === 0 || actionLoading || typeof window === 'undefined' || !window.electronAPI?.bulkRestore) return;
    setActionLoading(true);
    const count = selectedIds.size;
    try {
      await window.electronAPI.bulkRestore({ workIds: Array.from(selectedIds) });
      showToast(t('booksRestored', { count }));
      await loadTrash();
      await refreshBooks();
      onRestored?.();
    } catch (err) {
      console.error('[baglib/trash-modal] Failed to bulk restore:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePermanentlyDeleteSingle = async (bookId: string) => {
    if (actionLoading || typeof window === 'undefined' || !window.electronAPI?.permanentlyDeleteBook) return;
    setActionLoading(true);
    try {
      await window.electronAPI.permanentlyDeleteBook(bookId);
      setConfirmPermanentId(null);
      await loadTrash();
    } catch (err) {
      console.error('[baglib/trash-modal] Failed to permanently delete book:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePermanentlyDeleteSelected = async () => {
    if (selectedIds.size === 0 || actionLoading || typeof window === 'undefined' || !window.electronAPI?.bulkDelete) return;
    setActionLoading(true);
    try {
      await window.electronAPI.bulkDelete({ workIds: Array.from(selectedIds), permanent: true });
      setConfirmPermanentBulk(false);
      await loadTrash();
    } catch (err) {
      console.error('[baglib/trash-modal] Failed to bulk permanently delete:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEmptyTrash = async () => {
    if (actionLoading || typeof window === 'undefined' || !window.electronAPI?.emptyTrash) return;
    setActionLoading(true);
    try {
      await window.electronAPI.emptyTrash();
      setConfirmEmptyOpen(false);
      await loadTrash();
    } catch (err) {
      console.error('[baglib/trash-modal] Failed to empty trash:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      dir={dir}
    >
      <Modal asChild open={true} onClose={() => { if (!actionLoading) onClose(); }} label={t('trashBinTitle')}><div className="relative flex flex-col w-full max-w-4xl max-h-[calc(100dvh-2rem)] bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden text-main">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/80 bg-surface-raised/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">{t('trashBinTitle')}</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-500 border border-red-500/30">
                  {trashBooks.length}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">{t('trashBinEmptyDesc')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {trashBooks.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmEmptyOpen(true)}
                disabled={actionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('emptyTrash')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-muted hover:text-main rounded-xl hover:bg-surface-raised/60 transition-colors cursor-pointer"
             aria-label={t('close')}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action / Selection Bar */}
        {trashBooks.length > 0 && (
          <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/60 bg-surface-raised/20 text-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex items-center gap-1.5 text-muted hover:text-main font-medium cursor-pointer"
              >
                {selectedIds.size === trashBooks.length ? (
                  <CheckSquare className="w-4 h-4 text-pale-sky-500" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span>
                  {selectedIds.size === trashBooks.length
                    ? t('clearTrashSelection')
                    : t('selectAllTrash')}
                </span>
              </button>
              {selectedIds.size > 0 && (
                <span className="text-pale-sky-500 font-semibold">
                  ({selectedIds.size} {lang === 'ar' ? 'محدد' : 'selected'})
                </span>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRestoreSelected}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-pale-sky-500 text-white hover:bg-pale-sky-600 font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('restoreSelected')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPermanentBulk(true)}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('deletePermanentlyBtn')}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Content List */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
              <Loader2 className="w-8 h-8 animate-spin text-pale-sky-500" />
              <p className="text-sm">{lang === 'ar' ? 'جاري تحميل سلة المحذوفات...' : 'Loading trash...'}</p>
            </div>
          ) : trashBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="p-4 rounded-full bg-surface-raised/80 border border-border/80 text-muted">
                <Trash2 className="w-10 h-10 opacity-40" />
              </div>
              <h3 className="text-base font-semibold text-main">{t('trashBinEmpty')}</h3>
              <p className="text-xs text-muted max-w-sm">{t('trashBinEmptyDesc')}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {trashBooks.map((book) => {
                const isSelected = selectedIds.has(book.id);
                return (
                  <div
                    key={book.id}
                    onClick={() => handleToggleSelect(book.id)}
                    className={`flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-pale-sky-500/10 border-pale-sky-500/40 shadow-sm'
                        : 'bg-canvas/50 border-border/60 hover:bg-surface-raised/40 hover:border-border'
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelect(book.id);
                      }}
                      className="cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-pale-sky-500" />
                      ) : (
                        <Square className="w-4 h-4 text-muted" />
                      )}
                    </div>

                    {/* Book Cover / Icon */}
                    <div className="w-10 h-14 rounded-lg bg-surface-raised border border-border/80 overflow-hidden flex-shrink-0 flex items-center justify-center shadow-xs">
                      {book.coverImage ? (
                        <img
                          src={book.coverImage}
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen className="w-5 h-5 text-muted opacity-60" />
                      )}
                    </div>

                    {/* Book Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold truncate text-main">{book.title}</h4>
                        {book.digitalFormat && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-surface-raised text-muted border border-border uppercase">
                            {book.digitalFormat}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted truncate mt-0.5">{book.author}</p>
                      {book.deletedAt && (
                        <div className="flex items-center gap-1 text-[11px] text-muted/80 mt-1">
                          <Calendar className="w-3 h-3 text-red-400" />
                          <span>
                            {t('deletedAt')}: {formatDate(book.deletedAt)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div
                      className="flex items-center gap-1.5 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleRestoreSingle(book)}
                        disabled={actionLoading}
                        title={t('restoreBook')}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-pale-sky-500/40 text-pale-sky-600 dark:text-pale-sky-400 bg-pale-sky-500/10 hover:bg-pale-sky-500/20 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                       aria-label={t('restoreBook')}>
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('restore')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmPermanentId(book.id)}
                        disabled={actionLoading}
                        title={t('permanentlyDelete')}
                        className="p-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/15 transition-all cursor-pointer disabled:opacity-50"
                       aria-label={t('permanentlyDelete')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirmation Modal: Empty Trash */}
        {confirmEmptyOpen && (
          <div className="absolute inset-0 z-60 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
            <Modal asChild open={true} onClose={() => { if (!actionLoading) setConfirmEmptyOpen(false); }} label={t('emptyTrash')}><div className="w-full max-w-md p-6 bg-surface border border-red-500/40 rounded-2xl shadow-2xl text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-500/15 text-red-500 flex items-center justify-center border border-red-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-main">{t('emptyTrash')}</h3>
              <p className="text-xs text-muted leading-relaxed">{t('emptyTrashConfirm')}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmEmptyOpen(false)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-surface-raised cursor-pointer"
                >
                  {t('bulkCancelBtn') || 'إلغاء'}
                </button>
                <button
                  type="button"
                  onClick={handleEmptyTrash}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-lg shadow-red-600/30 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>{t('emptyTrash')}</span>
                </button>
              </div>
            </div></Modal>
          </div>
        )}

        {/* Confirmation Modal: Single Permanent Delete */}
        {confirmPermanentId && (
          <div className="absolute inset-0 z-60 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
            <Modal asChild open={true} onClose={() => { if (!actionLoading) setConfirmPermanentId(null); }} label={t('permanentlyDelete')}><div className="w-full max-w-md p-6 bg-surface border border-red-500/40 rounded-2xl shadow-2xl text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-500/15 text-red-500 flex items-center justify-center border border-red-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-main">{t('permanentlyDelete')}</h3>
              <p className="text-xs text-muted leading-relaxed">{t('permanentlyDeleteConfirm')}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmPermanentId(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-surface-raised cursor-pointer"
                >
                  {t('bulkCancelBtn') || 'إلغاء'}
                </button>
                <button
                  type="button"
                  onClick={() => handlePermanentlyDeleteSingle(confirmPermanentId)}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-lg shadow-red-600/30 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>{t('permanentlyDelete')}</span>
                </button>
              </div>
            </div></Modal>
          </div>
        )}

        {/* Confirmation Modal: Bulk Permanent Delete */}
        {confirmPermanentBulk && (
          <div className="absolute inset-0 z-60 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
            <Modal asChild open={true} onClose={() => { if (!actionLoading) setConfirmPermanentBulk(false); }} label={t('permanentlyDelete')}><div className="w-full max-w-md p-6 bg-surface border border-red-500/40 rounded-2xl shadow-2xl text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-500/15 text-red-500 flex items-center justify-center border border-red-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-main">{t('permanentlyDelete')}</h3>
              <p className="text-xs text-muted leading-relaxed">{t('permanentlyDeleteSelectedConfirm')}</p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmPermanentBulk(false)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-surface-raised cursor-pointer"
                >
                  {t('bulkCancelBtn') || 'إلغاء'}
                </button>
                <button
                  type="button"
                  onClick={handlePermanentlyDeleteSelected}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-lg shadow-red-600/30 cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span>{t('deletePermanentlyBtn')}</span>
                </button>
              </div>
            </div></Modal>
          </div>
        )}

        {/* Floating Success Toast */}
      </div></Modal>
    </div>
  );
};
