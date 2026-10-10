'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  CheckSquare,
  Square,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  BookOpen,
  Image as ImageIcon,
  User,
  Building,
  Calendar,
  Barcode,
  Layers,
  FileText,
  Hash
} from 'lucide-react';
import { BookItem } from '../../types/library';
import { BibliographicWork } from '../../../shared/types/bibliographic';
import { useWorkspace } from '../context/WorkspaceContext';

export interface DiffFieldItem {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  currentValue: any;
  incomingValue: any;
  hasCurrent: boolean;
  hasIncoming: boolean;
  isDifferent: boolean;
  renderValue?: (val: any) => React.ReactNode;
}

interface MetadataDiffModalProps {
  isOpen: boolean;
  currentBook: BookItem;
  incomingWork: BibliographicWork;
  onClose: () => void;
  onApply: (selectedUpdates: Partial<BookItem>) => void;
}

export const MetadataDiffModal: React.FC<MetadataDiffModalProps> = ({
  isOpen,
  currentBook,
  incomingWork,
  onClose,
  onApply,
}) => {
  const { lang, dir, t } = useWorkspace();
  const ArrowIcon = dir === 'rtl' ? ArrowLeft : ArrowRight;

  // Extract primary edition from incoming work
  const primaryEdition = incomingWork.editions?.[0];

  // Prepare normalized field candidates
  const incomingTitle = incomingWork.title || primaryEdition?.title;
  const incomingAuthor = incomingWork.authors?.[0] || 'مؤلف مجهول';
  const incomingPublisher = primaryEdition?.publisher;
  const incomingYear = incomingWork.firstPublishYear || (primaryEdition?.publishDate ? parseInt(primaryEdition.publishDate.substring(0, 4)) : undefined);
  const incomingIsbn = primaryEdition?.isbn13 || primaryEdition?.isbn || primaryEdition?.isbn10;
  const incomingPages = primaryEdition?.pages;
  const incomingCover = primaryEdition?.coverUrl || incomingWork.editions?.find((e) => Boolean(e.coverUrl))?.coverUrl;
  const incomingCategories = incomingWork.subjects && incomingWork.subjects.length > 0 ? incomingWork.subjects : undefined;
  const incomingDescription = incomingWork.description;

  const diffFields = useMemo<DiffFieldItem[]>(() => {
    const list: DiffFieldItem[] = [
      {
        id: 'title',
        labelKey: 'diffFieldTitle',
        icon: BookOpen,
        currentValue: currentBook.title || '',
        incomingValue: incomingTitle || '',
        hasCurrent: Boolean(currentBook.title?.trim()),
        hasIncoming: Boolean(incomingTitle?.trim()),
        isDifferent: (currentBook.title || '').trim() !== (incomingTitle || '').trim(),
      },
      {
        id: 'author',
        labelKey: 'diffFieldAuthor',
        icon: User,
        currentValue: currentBook.author || '',
        incomingValue: incomingAuthor || '',
        hasCurrent: Boolean(currentBook.author && currentBook.author !== 'مؤلف مجهول' && currentBook.author !== 'Unknown Author'),
        hasIncoming: Boolean(incomingAuthor && incomingAuthor !== 'مؤلف مجهول'),
        isDifferent: (currentBook.author || '').trim() !== (incomingAuthor || '').trim(),
      },
      {
        id: 'publisher',
        labelKey: 'diffFieldPublisher',
        icon: Building,
        currentValue: currentBook.publisher || '',
        incomingValue: incomingPublisher || '',
        hasCurrent: Boolean(currentBook.publisher?.trim()),
        hasIncoming: Boolean(incomingPublisher?.trim()),
        isDifferent: (currentBook.publisher || '').trim() !== (incomingPublisher || '').trim(),
      },
      {
        id: 'publicationYear',
        labelKey: 'diffFieldYear',
        icon: Calendar,
        currentValue: currentBook.publicationYear || '',
        incomingValue: incomingYear || '',
        hasCurrent: Boolean(currentBook.publicationYear),
        hasIncoming: Boolean(incomingYear),
        isDifferent: currentBook.publicationYear !== incomingYear,
      },
      {
        id: 'isbn',
        labelKey: 'diffFieldIsbn',
        icon: Barcode,
        currentValue: currentBook.isbn || '',
        incomingValue: incomingIsbn || '',
        hasCurrent: Boolean(currentBook.isbn?.trim()),
        hasIncoming: Boolean(incomingIsbn?.trim()),
        isDifferent: (currentBook.isbn || '').replace(/[-\s]/g, '') !== (incomingIsbn || '').replace(/[-\s]/g, ''),
      },
      {
        id: 'pagesCount',
        labelKey: 'diffFieldPages',
        icon: Hash,
        currentValue: currentBook.pagesCount || '',
        incomingValue: incomingPages || '',
        hasCurrent: Boolean(currentBook.pagesCount),
        hasIncoming: Boolean(incomingPages),
        isDifferent: currentBook.pagesCount !== incomingPages,
      },
      {
        id: 'categories',
        labelKey: 'diffFieldCategories',
        icon: Layers,
        currentValue: currentBook.categories || [],
        incomingValue: incomingCategories || [],
        hasCurrent: Boolean(currentBook.categories && currentBook.categories.length > 0),
        hasIncoming: Boolean(incomingCategories && incomingCategories.length > 0),
        isDifferent: JSON.stringify(currentBook.categories || []) !== JSON.stringify(incomingCategories || []),
        renderValue: (val: string[]) => (
          <div className="flex flex-wrap gap-1">
            {val && val.length > 0 ? (
              val.slice(0, 4).map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-canvas border border-subtle text-[11px] font-medium">
                  {c}
                </span>
              ))
            ) : (
              <span className="text-muted italic text-xs">{lang === 'ar' ? 'فارغ' : 'Empty'}</span>
            )}
            {val && val.length > 4 && (
              <span className="text-[10px] text-muted self-center">+{val.length - 4}</span>
            )}
          </div>
        )
      },
      {
        id: 'description',
        labelKey: 'diffFieldDescription',
        icon: FileText,
        currentValue: (currentBook as any).description || '',
        incomingValue: incomingDescription || '',
        hasCurrent: Boolean((currentBook as any).description?.trim()),
        hasIncoming: Boolean(incomingDescription?.trim()),
        isDifferent: ((currentBook as any).description || '').trim() !== (incomingDescription || '').trim(),
      },
      {
        id: 'coverImage',
        labelKey: 'diffFieldCover',
        icon: ImageIcon,
        currentValue: currentBook.coverImage || '',
        incomingValue: incomingCover || '',
        hasCurrent: Boolean(currentBook.coverImage?.trim()),
        hasIncoming: Boolean(incomingCover?.trim()),
        isDifferent: (currentBook.coverImage || '').trim() !== (incomingCover || '').trim(),
        renderValue: (val: string) => (
          val ? (
            <div className="flex items-center gap-2">
              <div className="w-9 h-12 rounded-lg bg-surface border border-subtle overflow-hidden shrink-0 shadow-xs">
                <img src={val} alt="Cover" className="w-full h-full object-cover" />
              </div>
              <span className="text-[11px] text-muted font-mono truncate max-w-xs">{val}</span>
            </div>
          ) : (
            <span className="text-muted italic text-xs">{lang === 'ar' ? 'لا يوجد غلاف' : 'No cover'}</span>
          )
        )
      }
    ];

    // Filter to fields where incoming has value
    return list.filter((f) => f.hasIncoming);
  }, [currentBook, incomingWork, lang]);

  // Default selection state:
  // If field is missing in current, auto-check it!
  // If field already exists in current and differs, auto-check if current is generic/empty, otherwise user decides.
  const [selectedFieldIds, setSelectedFieldIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const f of diffFields) {
      if (!f.hasCurrent) {
        initial[f.id] = true;
      } else if (f.isDifferent) {
        initial[f.id] = true;
      } else {
        initial[f.id] = false;
      }
    }
    return initial;
  });

  if (!isOpen) return null;

  const toggleField = (id: string) => {
    setSelectedFieldIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = () => {
    const updated: Record<string, boolean> = {};
    diffFields.forEach((f) => (updated[f.id] = true));
    setSelectedFieldIds(updated);
  };

  const deselectAll = () => {
    const updated: Record<string, boolean> = {};
    diffFields.forEach((f) => (updated[f.id] = false));
    setSelectedFieldIds(updated);
  };

  const selectedCount = Object.values(selectedFieldIds).filter(Boolean).length;
  const anyOverwritingExisting = diffFields.some((f) => selectedFieldIds[f.id] && f.hasCurrent && f.isDifferent);

  const handleConfirmApply = () => {
    const updates: Partial<BookItem> = {};

    if (selectedFieldIds.title && incomingTitle) updates.title = incomingTitle;
    if (selectedFieldIds.author && incomingAuthor) updates.author = incomingAuthor;
    if (selectedFieldIds.publisher && incomingPublisher) updates.publisher = incomingPublisher;
    if (selectedFieldIds.publicationYear && incomingYear) updates.publicationYear = incomingYear;
    if (selectedFieldIds.isbn && incomingIsbn) updates.isbn = incomingIsbn;
    if (selectedFieldIds.pagesCount && incomingPages) updates.pagesCount = incomingPages;
    if (selectedFieldIds.coverImage && incomingCover) updates.coverImage = incomingCover;
    if (selectedFieldIds.categories && incomingCategories) {
      updates.categories = Array.from(new Set([...(currentBook.categories || []), ...incomingCategories]));
    }
    if (selectedFieldIds.description && incomingDescription) {
      (updates as any).description = incomingDescription;
    }

    onApply(updates);
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-60 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
      dir={dir}
    >
      <div className="relative w-full max-w-3xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] font-sans">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-canvas/90 border-b border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-main text-base sm:text-lg truncate">
                {t('diffModalTitle')}
              </h3>
              <p className="text-xs text-muted truncate mt-0.5">
                {t('diffModalSubtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action toolbar (Select All / Deselect All) */}
        <div className="px-5 py-2.5 bg-canvas/50 border-b border-subtle flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-pale-sky-600 dark:text-pale-sky-400 font-bold hover:underline cursor-pointer"
            >
              {t('diffSelectAll')}
            </button>
            <span className="text-muted">•</span>
            <button
              type="button"
              onClick={deselectAll}
              className="text-muted hover:text-main cursor-pointer"
            >
              {t('diffDeselectAll')}
            </button>
          </div>

          {anyOverwritingExisting && (
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-[11px] font-semibold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('diffWarningOverwrite')}</span>
            </div>
          )}
        </div>

        {/* Diff List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 text-xs">
          {diffFields.map((field) => {
            const isChecked = Boolean(selectedFieldIds[field.id]);
            const Icon = field.icon;

            return (
              <div
                key={field.id}
                onClick={() => toggleField(field.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                  isChecked
                    ? 'bg-pale-sky-500/5 border-pale-sky-500/40 shadow-xs'
                    : 'bg-canvas/40 border-subtle hover:border-pale-sky-500/20'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${isChecked ? 'bg-pale-sky-500/15 text-pale-sky-500' : 'bg-surface text-muted'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-main">
                      {t(field.labelKey as any)}
                    </span>
                    {field.hasCurrent && field.isDifferent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        {lang === 'ar' ? 'تحديث لقيمة موجودة' : 'Updates existing value'}
                      </span>
                    )}
                    {!field.hasCurrent && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-evergreen-500/15 text-evergreen-600 dark:text-evergreen-400 border border-evergreen-500/30">
                        {lang === 'ar' ? 'حقل جديد فارغ' : 'Fills empty field'}
                      </span>
                    )}
                  </div>

                  <div className="shrink-0 text-pale-sky-500">
                    {isChecked ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5 text-muted opacity-60" />
                    )}
                  </div>
                </div>

                {/* Side-by-side comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Current Local Value */}
                  <div className="p-2.5 rounded-xl bg-surface/70 border border-subtle">
                    <span className="text-[10px] font-bold text-muted block mb-1">
                      {t('diffCurrent')}
                    </span>
                    <div className="text-main leading-relaxed font-medium">
                      {field.renderValue ? (
                        field.renderValue(field.currentValue)
                      ) : field.hasCurrent ? (
                        String(field.currentValue)
                      ) : (
                        <span className="text-muted italic text-[11px]">{lang === 'ar' ? 'فارغ' : 'Empty'}</span>
                      )}
                    </div>
                  </div>

                  {/* Incoming Remote Value */}
                  <div className="p-2.5 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/20">
                    <span className="text-[10px] font-bold text-pale-sky-600 dark:text-pale-sky-400 block mb-1">
                      {t('diffIncoming')}
                    </span>
                    <div className="text-main leading-relaxed font-semibold">
                      {field.renderValue ? (
                        field.renderValue(field.incomingValue)
                      ) : (
                        String(field.incomingValue)
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-canvas/90 border-t border-subtle flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {selectedCount > 0
              ? (lang === 'ar' ? `سيتم تحديث ${selectedCount} حقول` : `${selectedCount} fields will be updated`)
              : t('diffNoFieldsSelected')}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-subtle text-muted hover:text-main hover:bg-canvas text-xs font-bold transition-all cursor-pointer"
            >
              {t('diffCancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmApply}
              disabled={selectedCount === 0}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                selectedCount > 0
                  ? 'bg-pale-sky-500 text-white hover:bg-pale-sky-600 shadow-pale-sky-500/20'
                  : 'bg-canvas text-muted border border-subtle opacity-50 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{t('diffApplySelected').replace('{count}', selectedCount.toString())}</span>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
};
