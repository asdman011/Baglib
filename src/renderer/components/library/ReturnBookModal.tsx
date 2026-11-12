'use client';
import { errorMessage as getErrorMessage } from '../../../shared/errors';


import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { BookItem, LendingRecord } from '../../types/library';
import { useWorkspace } from '../context/WorkspaceContext';
import { Modal } from '../ui/Modal';

interface ReturnBookModalProps {
  isOpen: boolean;
  book: BookItem | null;
  activeLoan?: LendingRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}

const ReturnBookModalContent: React.FC<ReturnBookModalProps> = ({
  isOpen,
  book,
  activeLoan,
  onClose,
  onSuccess,
}) => {
  const { dir, t, refreshBooks } = useWorkspace();

  const [actualReturnDate, setActualReturnDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [conditionOnReturn, setConditionOnReturn] = useState(() => String(book?.condition || 'good'));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Target loan is either explicitly passed or the first unreturned loan in the book's history
  const targetLoan = activeLoan || (book?.lendingHistory || []).find((l) => !l.isReturned);


  if (!isOpen || !book || !targetLoan) return null;

  const today = new Date().toISOString().split('T')[0];
  const isOverdue = targetLoan.expectedReturnDate && targetLoan.expectedReturnDate < today;

  const daysOverdue = isOverdue
    ? Math.max(
        1,
        Math.round(
          (new Date(today).getTime() - new Date(targetLoan.expectedReturnDate).getTime()) /
            (1000 * 3600 * 24)
        )
      )
    : 0;

  // Determine if condition has degraded (condition audit check)
  const conditionRanks: Record<string, number> = {
    mint: 5,
    like_new: 5,
    جديدة: 5,
    ممتازة: 5,
    good: 4,
    جيدة: 4,
    fair: 3,
    مقبول: 3,
    مستعملة: 3,
    poor: 2,
    رديء: 2,
    متآكل: 1,
    antique: 4,
    'أثرية/قديمة': 4,
  };

  const initialConditionKey = (book.condition ? String(book.condition).toLowerCase() : 'good');
  const initialRank = conditionRanks[initialConditionKey] ?? 4;
  const currentRank = conditionRanks[conditionOnReturn.toLowerCase()] ?? 4;
  const isDegraded = currentRank < initialRank;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.lending?.returnBook) {
        await window.electronAPI.lending.returnBook({
          loanId: targetLoan.id,
          actualReturnDate: actualReturnDate || undefined,
          conditionOnReturn: conditionOnReturn || undefined,
          notes: notes.trim() || undefined,
        });
      }

      await refreshBooks();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      console.error('[baglib/lending] Return book failed:', err);
      setErrorMessage(getErrorMessage(err) || t('loanReturnFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      dir={dir}
    >
      <Modal asChild open={true} onClose={() => { if (!isSubmitting) onClose(); }} label={t('returnModalTitle')}><div className="relative w-full max-w-lg bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto transition-all animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-subtle flex items-center justify-between bg-canvas/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-evergreen-500/10 text-evergreen-600 dark:text-evergreen-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-main text-base sm:text-lg">
                {t('returnModalTitle')}
              </h3>
              <p className="text-xs text-muted">
                {t('returnModalDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
           aria-label={t('close')}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loan Context Card */}
        <div className="p-4 bg-canvas/30 border-b border-subtle space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted">
                {t('loanedWork')}
              </span>
              <h4 className="font-bold text-main text-sm truncate">{book.title}</h4>
            </div>
            {isOverdue ? (
              <span className="px-2.5 py-1 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-1 shrink-0 animate-pulse">
                <Clock className="w-3.5 h-3.5" />
                <span>{t('daysOverdueBadge', { days: daysOverdue })}</span>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold shrink-0">
                {t('activeLoanBadge')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-subtle/50 text-[11px]">
            <div>
              <span className="text-muted block text-[10px]">{t('borrowerName')}</span>
              <span className="font-bold text-main">{targetLoan.borrowerName}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px]">{t('borrowDate')}</span>
              <span className="text-main font-mono">{targetLoan.borrowDate}</span>
            </div>
            <div>
              <span className="text-muted block text-[10px]">{t('expectedReturnDate')}</span>
              <span className={`font-mono font-bold ${isOverdue ? 'text-red-500' : 'text-main'}`}>
                {targetLoan.expectedReturnDate}
              </span>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actual Return Date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-main flex items-center gap-1">
              <Calendar className="w-3 h-3 text-muted" />
              <span>{t('actualReturnDate')}</span>
            </label>
            <input
              type="date"
              required
              value={actualReturnDate}
              onChange={(e) => setActualReturnDate(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-evergreen-500 transition-colors"
            />
          </div>

          {/* Condition Audit & Verification */}
          <div className="space-y-2 p-3.5 rounded-2xl bg-canvas border border-subtle">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-main flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-evergreen-500" />
                <span>{t('conditionAuditLabel')}</span>
              </label>
              {book.condition && (
                <span className="text-[10px] text-muted">
                  {t('loanConditionBefore')}{' '}
                  <strong className="text-main">{String(book.condition)}</strong>
                </span>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-muted">{t('conditionOnReturn')}</span>
              <select
                value={conditionOnReturn}
                onChange={(e) => setConditionOnReturn(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-evergreen-500 transition-colors cursor-pointer"
              >
                <option value="mint">{t('conditionMint')}</option>
                <option value="good">{t('conditionGood')}</option>
                <option value="fair">{t('conditionFair')}</option>
                <option value="poor">{t('conditionPoor')}</option>
                <option value="antique">{t('conditionAntique')}</option>
              </select>
            </div>

            {isDegraded && (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  {t('loanConditionAuditNotice')}
                </span>
              </div>
            )}
          </div>

          {/* Return Notes */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-main flex items-center gap-1">
              <FileText className="w-3 h-3 text-muted" />
              <span>{t('notesOptional')}</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('returnNotesPlaceholder')}
              className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-evergreen-500 transition-colors"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-subtle flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-evergreen-600 hover:bg-evergreen-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? t('loanConfirming') : t('confirmReturn')}</span>
            </button>
          </div>
        </form>
      </div></Modal>
    </div>
  );
};

export const ReturnBookModal: React.FC<ReturnBookModalProps> = props => props.isOpen ? <ReturnBookModalContent {...props} key={`${props.book?.id}:${props.activeLoan?.id || ''}`} /> : null;
