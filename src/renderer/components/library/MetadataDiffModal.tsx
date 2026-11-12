'use client';

import React, { useState, useMemo } from 'react';
import { MetadataDiffView } from './MetadataDiffView';
import { MetadataModalLayout } from './MetadataModalLayout';
import {
  X,
  Check,
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
  Hash,
  Globe
} from 'lucide-react';
import { BookItem } from '../../types/library';
import { BibliographicWork } from '../../../shared/types/bibliographic';
import { isPlaceholderAuthor, isPlaceholderTitle } from '../../../shared/validators/metadata-validator';
import { useWorkspace } from '../context/WorkspaceContext';

export interface DiffFieldItem {
  id: string;
  labelKey: import('../../translations').TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  currentValue: unknown;
  incomingValue: unknown;
  hasCurrent: boolean;
  hasIncoming: boolean;
  isDifferent: boolean;
  renderValue?: (val: unknown) => React.ReactNode;
}

interface MetadataDiffModalProps {
  isOpen: boolean;
  currentBook: BookItem;
  incomingWork: BibliographicWork;
  candidateCount?: number;
  onBackToCandidates?: () => void;
  onClose: () => void;
  onApply: (selectedUpdates: Partial<BookItem>) => void;
}

export const MetadataDiffModal: React.FC<MetadataDiffModalProps> = ({
  isOpen,
  currentBook,
  incomingWork,
  candidateCount,
  onBackToCandidates,
  onClose,
  onApply,
}) => {
  const { dir, t } = useWorkspace();
  const ArrowIcon = dir === 'rtl' ? ArrowLeft : ArrowRight;

  // Extract primary edition from incoming work
  const primaryEdition = incomingWork.editions?.[0];

  // Prepare normalized field candidates
  const incomingTitle = incomingWork.title || primaryEdition?.title;
  const incomingLanguage = primaryEdition?.language;
  const isArabicIncoming = incomingLanguage?.toLowerCase().startsWith('ar') || /[\u0600-\u06FF]/.test(incomingTitle || '');
  const incomingAuthor = (incomingWork.authors && incomingWork.authors.length > 0)
    ? incomingWork.authors.join(isArabicIncoming ? '، ' : ', ')
    : t('unknownAuthor');
  const incomingPublisher = primaryEdition?.publisher;
  const incomingYear = incomingWork.firstPublishYear || (primaryEdition?.publishDate ? parseInt(primaryEdition.publishDate.substring(0, 4)) : undefined);
  const incomingIsbn = primaryEdition?.isbn13 || primaryEdition?.isbn || primaryEdition?.isbn10;
  const incomingPages = primaryEdition?.pages;
  const incomingCover = primaryEdition?.coverUrl || incomingWork.editions?.find((e) => Boolean(e.coverUrl))?.coverUrl;
  const incomingCategories = incomingWork.subjects && incomingWork.subjects.length > 0 ? incomingWork.subjects : undefined;
  const incomingDescription = incomingWork.description;
  const incomingAuthorBio = incomingWork.authorBio;

  // Resolve which server / provider fetched this candidate
  const providerName = useMemo(() => {
    const srcProvider =
      primaryEdition?.sources?.[0]?.provider ||
      incomingWork.editions?.find((e) => e.sources && e.sources.length > 0)?.sources?.[0]?.provider;
    if (srcProvider) return srcProvider;
    if (incomingWork.workId.startsWith('gb-')) return 'Google Books';
    if (incomingWork.workId.startsWith('ia-')) return 'Internet Archive';
    return 'Open Library';
  }, [incomingWork, primaryEdition]);

  const providerBadgeInfo = useMemo(() => {
    if (providerName.includes('Google')) {
      return {
        label: 'Google Books',
        classes: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
      };
    }
    if (providerName.includes('Archive')) {
      return {
        label: 'Internet Archive',
        classes: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
      };
    }
    return {
      label: 'Open Library',
      classes: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    };
  }, [providerName]);

  const diffFields = useMemo<DiffFieldItem[]>(() => {
    const list: DiffFieldItem[] = [
      {
        id: 'title',
        labelKey: 'diffFieldTitle',
        icon: BookOpen,
        currentValue: currentBook.title || '',
        incomingValue: incomingTitle || '',
        hasCurrent: Boolean(currentBook.title?.trim() && !isPlaceholderTitle(currentBook.title)),
        hasIncoming: Boolean(incomingTitle?.trim() && !isPlaceholderTitle(incomingTitle)),
        isDifferent: (currentBook.title || '').trim() !== (incomingTitle || '').trim(),
      },
      {
        id: 'author',
        labelKey: 'diffFieldAuthor',
        icon: User,
        currentValue: currentBook.author || '',
        incomingValue: incomingAuthor || '',
        hasCurrent: Boolean(currentBook.author && !isPlaceholderAuthor(currentBook.author)),
        hasIncoming: Boolean(incomingAuthor && !isPlaceholderAuthor(incomingAuthor)),
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
        renderValue: (val: unknown) => (
          <div className="flex flex-wrap gap-1">
            {Array.isArray(val) && val.length > 0 ? (
              val.slice(0, 4).map((c, i) => (
                <span key={i} className="px-2 py-0.5 rounded-md bg-canvas border border-subtle text-[11px] font-medium">
                  {c}
                </span>
              ))
            ) : (
              <span className="text-muted italic text-xs">{t('libraryEmpty')}</span>
            )}
            {Array.isArray(val) && val.length > 4 && (
              <span className="text-[10px] text-muted self-center">+{val.length - 4}</span>
            )}
          </div>
        )
      },
      {
        id: 'description',
        labelKey: 'diffFieldDescription',
        icon: FileText,
        currentValue: currentBook.description || '',
        incomingValue: incomingDescription || '',
        hasCurrent: Boolean(currentBook.description?.trim()),
        hasIncoming: Boolean(incomingDescription?.trim()),
        isDifferent: (currentBook.description || '').trim() !== (incomingDescription || '').trim(),
      },
      {
        id: 'authorBio',
        labelKey: 'diffFieldAuthorBio',
        icon: User,
        currentValue: currentBook.authorBio || '',
        incomingValue: incomingAuthorBio || '',
        hasCurrent: Boolean(currentBook.authorBio?.trim()),
        hasIncoming: Boolean(incomingAuthorBio?.trim()),
        isDifferent: (currentBook.authorBio || '').trim() !== (incomingAuthorBio || '').trim(),
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
        renderValue: (val: unknown) => (
          typeof val === 'string' && val ? (
            <div className="flex items-center gap-2">
              <div className="w-9 h-12 rounded-lg bg-surface border border-subtle overflow-hidden shrink-0 shadow-xs">
                <img src={val} alt={t('libraryExampleCover')} className="w-full h-full object-cover" />
              </div>
              <span className="text-[11px] text-muted font-mono truncate max-w-xs">{val}</span>
            </div>
          ) : (
            <span className="text-muted italic text-xs">{t('libraryNoCover2')}</span>
          )
        )
      }
    ];

    // Filter to fields where incoming has value
    return list.filter((f) => f.hasIncoming);
  }, [currentBook, incomingAuthor, incomingAuthorBio, incomingCategories, incomingCover, incomingDescription, incomingIsbn, incomingPages, incomingPublisher, incomingTitle, incomingYear, t]);

  // Default selection state:
  // When an online catalog candidate is approved, all incoming fields with valid values
  // are selected by default so the canonical title and verified metadata are applied.
  // The user can uncheck individual fields if they want to retain specific local values.
  const [selectedFieldIds, setSelectedFieldIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const f of diffFields) {
      initial[f.id] = f.hasIncoming;
    }
    return initial;
  });

  // Reset for a different book or candidate. Context-only updates retain user choices.
  const [previousResetInputs1, setPreviousResetInputs1] = useState<readonly unknown[] | null>(null);
  const resetInputs1 = [currentBook, incomingWork];
  if (previousResetInputs1 === null || resetInputs1.some((value, index) => !Object.is(value, previousResetInputs1[index]))) {
    setPreviousResetInputs1(resetInputs1);

    const next: Record<string, boolean> = {};
    for (const f of diffFields) {
      next[f.id] = f.hasIncoming;
    }
    setSelectedFieldIds(next);

  }

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
      updates.description = incomingDescription;
    }
    if (selectedFieldIds.authorBio && incomingAuthorBio) {
      updates.authorBio = incomingAuthorBio;
    }

    const prov: import('../../../shared/types/work').MetadataProvenance & { fieldSources: NonNullable<import('../../../shared/types/work').MetadataProvenance['fieldSources']> } = {
      ...(currentBook.metadataProvenance || {}),
      primaryProvider: providerName,
      providerId: incomingWork.workId,
      sourceUrl: primaryEdition?.sources?.[0]?.url || incomingWork.editions?.[0]?.sources?.[0]?.url,
      discoveredAt: new Date().toISOString(),
      method: 'online_api',
      confidence: 0.95,
      fieldSources: {
        ...(currentBook.metadataProvenance?.fieldSources || {}),
      },
      auditTrace: [
        ...(currentBook.metadataProvenance?.auditTrace || []),
        `[Online Auto-Fill] Applied updates from ${providerName} (Work: ${incomingWork.workId}) at ${new Date().toLocaleTimeString()}`,
      ],
      rawBibliographic: incomingWork,
    };

    if (selectedFieldIds.title && incomingTitle) {
      prov.fieldSources.title = { source: providerName, status: 'verified', value: incomingTitle, confidence: 0.98 };
    }
    if (selectedFieldIds.author && incomingAuthor) {
      prov.fieldSources.author = { source: providerName, status: 'verified', value: incomingAuthor, confidence: 0.98 };
    }
    if (selectedFieldIds.publisher && incomingPublisher) {
      prov.fieldSources.publisher = { source: providerName, status: 'verified', value: incomingPublisher, confidence: 0.95 };
    }
    if (selectedFieldIds.publicationYear && incomingYear) {
      prov.fieldSources.publicationYear = { source: providerName, status: 'verified', value: incomingYear, confidence: 0.95 };
    }
    if (selectedFieldIds.isbn && incomingIsbn) {
      prov.fieldSources.isbn = { source: providerName, status: 'verified', value: incomingIsbn, confidence: 1.0 };
    }
    if (selectedFieldIds.pagesCount && incomingPages) {
      prov.fieldSources.pagesCount = { source: providerName, status: 'verified', value: incomingPages, confidence: 0.95 };
    }
    if (selectedFieldIds.coverImage && incomingCover) {
      prov.fieldSources.coverImage = { source: providerName, status: 'verified', value: incomingCover, confidence: 0.95 };
    }
    if (selectedFieldIds.description && incomingDescription) {
      prov.fieldSources.description = { source: providerName, status: 'verified', value: incomingDescription, confidence: 0.9 };
    }
    if (selectedFieldIds.authorBio && incomingAuthorBio) {
      prov.fieldSources.authorBio = { source: providerName, status: 'verified', value: incomingAuthorBio, confidence: 0.9 };
    }

    updates.metadataProvenance = prov;

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
      <MetadataModalLayout open={true} onClose={onClose} label={t('diffModalTitle')}
        header={<>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-main text-base sm:text-lg truncate">
                  {t('diffModalTitle')}
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${providerBadgeInfo.classes}`}>
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span>{t('diffModalSource')}: {providerBadgeInfo.label}</span>
                </span>
              </div>
              <p className="text-xs text-muted truncate mt-0.5">
                {t('diffModalSubtitle')}
              </p>
            </div>
          </div>

          <button aria-label={t('close')}
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
 </>}
        footer={<>
          <span className="text-xs text-muted">
            {selectedCount > 0
              ? (t('libraryFieldsWillBeUpdated', { value1: selectedCount }))
              : t('diffNoFieldsSelected')}
          </span>

          <div className="flex items-center gap-2">
            <button aria-label={t('close')}
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
 </>}
      >
<div className="px-5 py-2.5 bg-canvas/50 border-b border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
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

          <div className="flex flex-wrap items-center gap-2">
            {onBackToCandidates && candidateCount && candidateCount > 1 && (
              <button
                type="button"
                onClick={onBackToCandidates}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface border border-subtle hover:bg-canvas text-main text-xs font-semibold transition-colors cursor-pointer"
              >
                <ArrowIcon className="w-3.5 h-3.5" />
                <span>{t('candidateBackToPicker', { count: candidateCount })}</span>
              </button>
            )}

            {anyOverwritingExisting && (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-[11px] font-semibold bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{t('diffWarningOverwrite')}</span>
              </div>
            )}
          </div>
        </div>
<div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3 text-xs">
          <MetadataDiffView rows={diffFields.map(field => ({
            id: field.id, label: t(field.labelKey),
            current: field.renderValue ? field.renderValue(field.currentValue) : field.hasCurrent ? String(field.currentValue) : '',
            incoming: field.renderValue ? field.renderValue(field.incomingValue) : String(field.incomingValue),
            hasCurrent: field.hasCurrent, hasIncoming: field.hasIncoming, different: field.isDifferent,
            selected: Boolean(selectedFieldIds[field.id]),
          }))} onToggle={toggleField} />
        </div>
      </MetadataModalLayout>
    </div>
  );
};
