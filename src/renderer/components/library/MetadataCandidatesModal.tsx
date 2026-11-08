'use client';

import React, { useState } from 'react';
import {
  X,
  Check,
  Sparkles,
  BookOpen,
  User,
  Building,
  Calendar,
  Barcode,
  Hash,
  Globe,
  ArrowRight,
  ArrowLeft,
  Search,
  CheckCircle2,
  FileQuestion,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
} from 'lucide-react';
import { BibliographicWork } from '../../../shared/types/bibliographic';
import { CandidateMetadataItem } from '../../hooks/useMetadataLookup';
import { useWorkspace } from '../context/WorkspaceContext';
import { TechnicalSearchDiagnostics } from '../../../shared/types/enrichment';
import { FileQueryDiagnosticsPanel } from './FileQueryDiagnosticsPanel';

interface MetadataCandidatesModalProps {
  isOpen: boolean;
  searchTitle?: string;
  searchAuthor?: string;
  searchIsbn?: string;
  filePath?: string;
  fileSize?: string | number;
  diagnostics?: TechnicalSearchDiagnostics;
  candidates: BibliographicWork[];
  evaluations?: CandidateMetadataItem[];
  selectedWork: BibliographicWork | null;
  onSelectWork: (work: BibliographicWork) => void;
  onProceed: (work: BibliographicWork) => void;
  onClose: () => void;
  onSearchDeeper?: () => Promise<void> | void;
  isSearchingDeeper?: boolean;
}

export const MetadataCandidatesModal: React.FC<MetadataCandidatesModalProps> = ({
  isOpen,
  searchTitle,
  searchAuthor,
  searchIsbn,
  filePath,
  fileSize,
  diagnostics,
  candidates,
  evaluations = [],
  selectedWork,
  onSelectWork,
  onProceed,
  onClose,
  onSearchDeeper,
  isSearchingDeeper = false,
}) => {
  const { lang, dir, t } = useWorkspace();
  const ArrowIcon = dir === 'rtl' ? ArrowLeft : ArrowRight;

  const [activeSelected, setActiveSelected] = useState<BibliographicWork | null>(
    selectedWork || candidates[0] || null
  );
  const [showPlausible, setShowPlausible] = useState<boolean>(false);

  // Sync selected work when candidates change
  const [previousResetInputs1, setPreviousResetInputs1] = useState<readonly unknown[] | null>(null);
  const resetInputs1 = [selectedWork, candidates];
  if (previousResetInputs1 === null || resetInputs1.some((value, index) => !Object.is(value, previousResetInputs1[index]))) {
    setPreviousResetInputs1(resetInputs1);

    if (selectedWork) {
      setActiveSelected(selectedWork);
    } else if (candidates.length > 0 && !activeSelected) {
      setActiveSelected(candidates[0]);
    }

  }


  const handleCardClick = (work: BibliographicWork) => {
    setActiveSelected(work);
    onSelectWork(work);
  };

  const handleCardDoubleClick = (work: BibliographicWork) => {
    setActiveSelected(work);
    onSelectWork(work);
    onProceed(work);
  };

  const handleProceedClick = () => {
    if (activeSelected) {
      onProceed(activeSelected);
    }
  };

  // Helper to find evaluation for a candidate
  const getEvaluation = (work: BibliographicWork): CandidateMetadataItem | undefined => {
    return evaluations.find((e) => e.work.workId === work.workId);
  };

  const getProviderName = (work: BibliographicWork, evalItem?: CandidateMetadataItem): string => {
    if (evalItem?.providerName) return evalItem.providerName;
    const srcProvider = work.editions?.[0]?.sources?.[0]?.provider;
    if (srcProvider) return srcProvider;
    if (work.workId.startsWith('gb-')) return 'Google Books';
    if (work.workId.startsWith('ia-')) return 'Internet Archive';
    return 'Open Library';
  };

  const getProviderBadgeClasses = (providerName: string): string => {
    if (providerName.includes('Google')) {
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    }
    if (providerName.includes('Archive')) {
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    }
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  };

  const getMatchBadge = (evalItem?: CandidateMetadataItem) => {
    const score = evalItem ? Math.round(evalItem.score) : 80;
    const matchType = evalItem?.matchType || (score >= 75 ? 'exact' : score >= 45 ? 'high' : 'alternative');

    if (matchType === 'exact') {
      return {
        label: t('candidateMatchExact'),
        score,
        classes: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-bold',
      };
    }
    if (matchType === 'high') {
      return {
        label: t('candidateMatchHigh'),
        score,
        classes: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 font-medium',
      };
    }
    return {
      label: t('candidateMatchAlternative'),
      score,
      classes: 'bg-canvas text-muted border-subtle font-normal',
    };
  };

  // Partition candidates into Top Matches (top 3-5) and Plausible Alternatives
  const { topCandidates, plausibleCandidates } = React.useMemo(() => {
    if (!candidates || candidates.length === 0) {
      return { topCandidates: [], plausibleCandidates: [] };
    }

    const top: BibliographicWork[] = [];
    const plausible: BibliographicWork[] = [];

    candidates.forEach((work, idx) => {
      const evalItem = evaluations.find((e) => e.work.workId === work.workId);
      const isHighConfidence =
        evalItem?.isCertainMatch ||
        evalItem?.matchType === 'exact' ||
        evalItem?.matchType === 'high' ||
        (evalItem && evalItem.confidence >= 0.70) ||
        (evalItem && evalItem.score >= 50);

      if (isHighConfidence && top.length < 5) {
        top.push(work);
      } else if (idx < 3 && top.length === 0) {
        top.push(work);
      } else {
        plausible.push(work);
      }
    });

    return { topCandidates: top, plausibleCandidates: plausible };
  }, [candidates, evaluations]);

  const renderCandidateCard = (work: BibliographicWork) => {
    const isSelected = activeSelected?.workId === work.workId;
    const evalItem = getEvaluation(work);
    const matchBadge = getMatchBadge(evalItem);
    const provider = getProviderName(work, evalItem);
    const primaryEdition = work.editions?.[0];
    const coverUrl =
      primaryEdition?.coverUrl ||
      work.editions?.find((e) => Boolean(e.coverUrl))?.coverUrl;
    const year =
      work.firstPublishYear ||
      (primaryEdition?.publishDate ? parseInt(primaryEdition.publishDate.substring(0, 4)) : undefined);
    const isbn = primaryEdition?.isbn13 || primaryEdition?.isbn || primaryEdition?.isbn10;
    const publisher = primaryEdition?.publisher;
    const pages = primaryEdition?.pages;
    const language = primaryEdition?.language;

    if (!isOpen) return null;

  return (
      <div
        key={work.workId}
        onClick={() => handleCardClick(work)}
        onDoubleClick={() => handleCardDoubleClick(work)}
        className={`group relative p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex gap-3.5 sm:gap-4 items-start ${
          isSelected
            ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30 shadow-md'
            : 'bg-surface hover:bg-canvas/70 border-subtle hover:border-amber-500/40'
        }`}
      >
        {/* Radio / Selection Indicator */}
        <div className="pt-1 shrink-0">
          <div
            className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'border-subtle bg-canvas text-transparent group-hover:border-amber-400'
            }`}
          >
            <Check className="w-3 h-3 stroke-[3]" />
          </div>
        </div>

        {/* Book Cover Thumbnail */}
        <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl bg-canvas border border-subtle overflow-hidden shrink-0 shadow-xs flex items-center justify-center">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={work.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted p-2 text-center">
              <BookOpen className="w-6 h-6 stroke-[1.5] opacity-50" />
              <span className="text-[9px] mt-1 font-sans opacity-70">
                {lang === 'ar' ? 'بلا غلاف' : 'No Cover'}
              </span>
            </div>
          )}
        </div>

        {/* Candidate Content Body */}
        <div className="flex-1 min-w-0">
          {/* Top Badges Row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {/* Provider Badge */}
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${getProviderBadgeClasses(
                provider
              )}`}
            >
              {provider}
            </span>

            {/* Match Badge */}
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] border flex items-center gap-1 ${matchBadge.classes}`}
            >
              {matchBadge.score >= 70 && <CheckCircle2 className="w-3 h-3" />}
              {matchBadge.label} ({matchBadge.score}%)
            </span>

            {/* Match factors breakdown */}
            {evalItem?.isCertainMatch && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                {t('factorIsbnMatch')}
              </span>
            )}
            {evalItem?.matchType === 'exact' && !evalItem.isCertainMatch && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                {t('factorTitleSimilarity')} 100%
              </span>
            )}
            {evalItem?.matchType === 'high' && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25">
                {t('factorAuthorMatch')}
              </span>
            )}

            {/* Selected Pill if active */}
            {isSelected && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500 text-white">
                {t('candidateSelectedBadge')}
              </span>
            )}
          </div>

          {/* Book Title */}
          <h4 className="font-bold text-main text-sm sm:text-base leading-snug line-clamp-2">
            {work.title}
          </h4>

          {/* Author(s) */}
          {work.authors && work.authors.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted font-medium mt-1">
              <User className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span className="truncate">{work.authors.join('، ')}</span>
            </div>
          )}

          {/* Meta tags flex row: Publisher, Year, Pages, Language, ISBN */}
          <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-[11px] text-muted mt-2">
            {publisher && (
              <span className="flex items-center gap-1">
                <Building className="w-3 h-3 shrink-0 opacity-60" />
                <span className="truncate max-w-[150px]">{publisher}</span>
              </span>
            )}

            {year ? (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3 shrink-0 opacity-60" />
                <span>{t('candidateYear', { year })}</span>
              </span>
            ) : (
              <span className="italic opacity-60">{t('candidateNoYear')}</span>
            )}

            {pages ? (
              <span className="flex items-center gap-1">
                <Hash className="w-3 h-3 shrink-0 opacity-60" />
                <span>{t('candidatePages', { count: pages })}</span>
              </span>
            ) : null}

            {language && (
              <span className="flex items-center gap-1 font-mono uppercase bg-canvas px-1.5 py-0.5 rounded border border-subtle text-[10px]">
                <Globe className="w-3 h-3 shrink-0 opacity-60" />
                {language}
              </span>
            )}

            {isbn && (
              <span className="flex items-center gap-1 font-mono text-[10px] text-muted">
                <Barcode className="w-3 h-3 shrink-0 opacity-60" />
                {isbn}
              </span>
            )}
          </div>

          {/* Description Excerpt */}
          {work.description && (
            <p className="mt-2 text-xs text-muted/80 line-clamp-2 leading-relaxed">
              {work.description}
            </p>
          )}

          {/* Author Bio Excerpt */}
          {work.authorBio && (
            <p className="mt-1.5 text-[11px] text-pale-sky-600 dark:text-pale-sky-400 line-clamp-1 italic">
              «{work.authorBio}»
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-60 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
      dir={dir}
    >
      <div className="relative w-full max-w-4xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] font-sans">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-canvas/90 border-b border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-main text-base sm:text-lg truncate">
                  {t('candidatesModalTitle')}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  {t('candidatesCountBadge', { count: candidates.length })}
                </span>
              </div>
              <p className="text-xs text-muted truncate mt-0.5">
                {t('candidatesModalSubtitle', { count: candidates.length })}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer shrink-0"
            title={t('cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Evidence Pill Bar */}
        {(searchTitle || searchAuthor || searchIsbn) && (
          <div className="px-5 py-2.5 bg-canvas/50 border-b border-subtle flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted font-medium flex items-center gap-1">
              <Search className="w-3.5 h-3.5" />
              {t('candidatesSearchSummary')}
            </span>
            {searchTitle && (
              <span className="px-2.5 py-1 rounded-lg bg-surface border border-subtle text-main font-semibold">
                «{searchTitle}»
              </span>
            )}
            {searchAuthor && (
              <span className="px-2.5 py-1 rounded-lg bg-surface border border-subtle text-muted">
                {searchAuthor}
              </span>
            )}
            {searchIsbn && (
              <span className="px-2.5 py-1 rounded-lg bg-surface border border-subtle text-muted font-mono">
                ISBN: {searchIsbn}
              </span>
            )}
          </div>
        )}

        {/* Candidates List Container */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3">
          {/* Collapsible File & Query Diagnostics Panel */}
          <FileQueryDiagnosticsPanel
            diagnostics={diagnostics}
            filePath={filePath}
            fileSize={fileSize}
            searchTitle={searchTitle}
            searchAuthor={searchAuthor}
            searchIsbn={searchIsbn}
            className="mb-3"
          />

          {candidates.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-3xl bg-canvas border border-subtle flex items-center justify-center text-muted mb-3">
                <FileQuestion className="w-8 h-8" />
              </div>
              <h4 className="text-main font-bold text-base mb-1">
                {t('candidateNoResults')}
              </h4>
              <p className="text-muted text-xs max-w-md">
                {t('candidateNoResultsHint')}
              </p>
            </div>
          ) : (
            <>
              {/* Primary High-Confidence Candidates */}
              {plausibleCandidates.length > 0 && (
                <div className="text-xs font-bold text-main flex items-center gap-2 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t('candidateTopMatchesHeader')}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    {topCandidates.length}
                  </span>
                </div>
              )}

              {topCandidates.map(renderCandidateCard)}

              {/* Progressive Actions Bar: Search Deeper & Plausible Matches Toggle */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5 border-t border-subtle mt-4">
                {/* Plausible Matches Toggle */}
                {plausibleCandidates.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPlausible((prev) => !prev)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-canvas border border-subtle hover:border-amber-500/40 text-xs font-semibold text-main transition-colors cursor-pointer shadow-xs"
                  >
                    <Layers className="w-4 h-4 text-amber-500" />
                    <span>
                      {showPlausible
                        ? t('candidateHidePlausibleBtn')
                        : t('candidateShowPlausibleBtn', { count: plausibleCandidates.length })}
                    </span>
                    {showPlausible ? (
                      <ChevronUp className="w-3.5 h-3.5 text-muted" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted" />
                    )}
                  </button>
                ) : <div />}

                {/* Search Deeper Button */}
                {onSearchDeeper && (
                  <button
                    type="button"
                    onClick={() => onSearchDeeper()}
                    disabled={isSearchingDeeper}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-canvas border border-subtle hover:border-amber-500/40 text-xs font-semibold text-main transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {isSearchingDeeper ? (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                    ) : (
                      <Search className="w-4 h-4 text-amber-500" />
                    )}
                    <span>
                      {isSearchingDeeper
                        ? t('candidateSearchingDeeper')
                        : t('candidateSearchDeeperBtn')}
                    </span>
                  </button>
                )}
              </div>

              {/* Plausible Matches Expanded Section */}
              {showPlausible && plausibleCandidates.length > 0 && (
                <div className="space-y-3 pt-3 animate-in fade-in duration-200">
                  <div className="text-xs font-bold text-muted flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-amber-500" />
                    <span>{t('candidatePlausibleMatchesHeader')}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-canvas border border-subtle">
                      {plausibleCandidates.length}
                    </span>
                  </div>
                  {plausibleCandidates.map(renderCandidateCard)}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-canvas/90 border-t border-subtle flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-xs text-muted truncate">
            {activeSelected ? (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-main font-semibold truncate">
                  {activeSelected.title}
                </span>
                <span className="opacity-75">
                  ({getProviderName(activeSelected, getEvaluation(activeSelected))})
                </span>
              </span>
            ) : (
              <span>{t('candidateSelectPrompt')}</span>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-subtle text-muted hover:text-main hover:bg-canvas text-xs font-semibold transition-colors cursor-pointer"
            >
              {t('cancel')}
            </button>

            <button
              type="button"
              disabled={!activeSelected}
              onClick={handleProceedClick}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                activeSelected
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                  : 'bg-muted/30 text-muted cursor-not-allowed'
              }`}
            >
              <span>{t('candidateProceedToDiff')}</span>
              <ArrowIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
