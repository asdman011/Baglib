'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  UserCheck,
  Calendar,
  Phone,
  FileText,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Clock,
  Sparkles,
  Users
} from 'lucide-react';
import { BookItem } from '../../types/library';
import { useWorkspace } from '../context/WorkspaceContext';
import type { BorrowerSummary } from '../../../shared/types/physical-library';

interface LendBookModalProps {
  isOpen: boolean;
  book: BookItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const LendBookModal: React.FC<LendBookModalProps> = ({
  isOpen,
  book,
  onClose,
  onSuccess,
}) => {
  const { lang, dir, t, refreshBooks } = useWorkspace();

  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerContact, setBorrowerContact] = useState('');
  const [borrowDate, setBorrowDate] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [conditionOut, setConditionOut] = useState('good');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pastBorrowers, setPastBorrowers] = useState<BorrowerSummary[]>([]);

  // Initialize dates and condition on open
  useEffect(() => {
    if (isOpen && book) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      setBorrowDate(todayStr);

      // Default expected return date: +14 days
      const due = new Date(today);
      due.setDate(due.getDate() + 14);
      setExpectedReturnDate(due.toISOString().split('T')[0]);

      setBorrowerName('');
      setBorrowerContact('');
      setNotes('');
      setErrorMessage(null);

      // Match current book condition if available
      if (book.condition) {
        setConditionOut(String(book.condition));
      } else {
        setConditionOut('good');
      }

      // Fetch known past borrowers for autocomplete
      if (typeof window !== 'undefined' && window.electronAPI?.lending?.getBorrowers) {
        window.electronAPI.lending
          .getBorrowers()
          .then((res: BorrowerSummary[]) => {
            if (Array.isArray(res)) setPastBorrowers(res);
          })
          .catch((err) => console.warn('[baglib/lending] Failed to load borrowers:', err));
      }
    }
  }, [isOpen, book]);

  if (!isOpen || !book) return null;

  const handleSelectBorrower = (borrower: BorrowerSummary) => {
    setBorrowerName(borrower.borrowerName);
    if (borrower.borrowerContact) {
      setBorrowerContact(borrower.borrowerContact);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!borrowerName.trim()) {
      setErrorMessage(lang === 'ar' ? 'يرجى إدخال اسم المستعير' : 'Please enter borrower name');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.lending?.borrowBook) {
        await window.electronAPI.lending.borrowBook({
          workId: book.id,
          borrowerName: borrowerName.trim(),
          borrowerContact: borrowerContact.trim() || undefined,
          borrowDate: borrowDate || undefined,
          expectedReturnDate: expectedReturnDate || undefined,
          conditionOut: conditionOut || undefined,
          notes: notes.trim() || undefined,
        });
      }

      await refreshBooks();
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[baglib/lending] Borrow book failed:', err);
      setErrorMessage(err?.message || (lang === 'ar' ? 'فشلت عملية الإعارة' : 'Loan failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const locationDisplay = [book.room, book.bookcase, book.shelf, book.shelfSection]
    .filter(Boolean)
    .join(' › ');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      dir={dir}
    >
      <div className="relative w-full max-w-lg bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto transition-all animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-subtle flex items-center justify-between bg-canvas/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-main text-base sm:text-lg">
                {t('lendModalTitle')}
              </h3>
              <p className="text-xs text-muted">
                {t('lendModalDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Book Context Banner */}
        <div className="p-4 bg-canvas/30 border-b border-subtle flex items-start gap-3">
          <div className="w-12 h-16 rounded-xl bg-canvas border border-subtle overflow-hidden shrink-0 flex items-center justify-center">
            {book.coverImage ? (
              <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-muted uppercase">{book.title.slice(0, 2)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-main text-sm truncate">{book.title}</h4>
            <p className="text-xs text-muted truncate">{book.author || t('noAuthor')}</p>
            {locationDisplay && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 mt-1 font-mono">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{locationDisplay}</span>
              </div>
            )}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Past Borrowers quick chips */}
          {pastBorrowers.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-muted flex items-center gap-1">
                <Users className="w-3 h-3" />
                {t('knownBorrowersLabel')}
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                {pastBorrowers.slice(0, 5).map((b) => (
                  <button
                    key={b.borrowerName}
                    type="button"
                    onClick={() => handleSelectBorrower(b)}
                    className="text-[11px] px-2.5 py-1 rounded-xl bg-canvas border border-subtle hover:border-amber-500/50 text-main transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>{b.borrowerName}</span>
                    {b.activeLoans > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Borrower Name */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-main flex items-center gap-1">
              <span>{t('borrowerName')}</span>
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
              placeholder={t('borrowerNamePlaceholder')}
              list="borrower-name-suggestions"
              className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
            />
            <datalist id="borrower-name-suggestions">
              {pastBorrowers.map((b) => (
                <option key={b.borrowerName} value={b.borrowerName} />
              ))}
            </datalist>
          </div>

          {/* Borrower Contact */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-main flex items-center gap-1">
              <Phone className="w-3 h-3 text-muted" />
              <span>{t('borrowerContact')}</span>
            </label>
            <input
              type="text"
              value={borrowerContact}
              onChange={(e) => setBorrowerContact(e.target.value)}
              placeholder={t('borrowerContactPlaceholder')}
              className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          {/* Dates: Borrow & Expected Return */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-main flex items-center gap-1">
                <Calendar className="w-3 h-3 text-muted" />
                <span>{t('borrowDate')}</span>
              </label>
              <input
                type="date"
                value={borrowDate}
                onChange={(e) => setBorrowDate(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-main flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-500" />
                <span>{t('expectedReturnDate')}</span>
              </label>
              <input
                type="date"
                value={expectedReturnDate}
                onChange={(e) => setExpectedReturnDate(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          {/* Condition Out */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-main">
              {t('loanConditionOut')}
            </label>
            <select
              value={conditionOut}
              onChange={(e) => setConditionOut(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors cursor-pointer"
            >
              <option value="mint">{t('conditionMint')}</option>
              <option value="good">{t('conditionGood')}</option>
              <option value="fair">{t('conditionFair')}</option>
              <option value="poor">{t('conditionPoor')}</option>
              <option value="antique">{t('conditionAntique')}</option>
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-main flex items-center gap-1">
              <FileText className="w-3 h-3 text-muted" />
              <span>{t('notesOptional')}</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
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
              disabled={isSubmitting || !borrowerName.trim()}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isSubmitting ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : t('confirmLend')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
