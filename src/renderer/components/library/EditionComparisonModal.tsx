import { errorMessage as getErrorMessage } from '../../../shared/errors';
import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { BookItem } from '../../../shared/types/work';
import {
  EnrichmentCandidateEdition,
  EnrichmentComparison,
  EnrichmentFieldKey,
  ApplyEnrichmentRequest,
  TechnicalSearchDiagnostics,
} from '../../../shared/types/enrichment';
import { FileQueryDiagnosticsPanel } from './FileQueryDiagnosticsPanel';

interface EditionComparisonModalProps {
  isOpen: boolean;
  book: BookItem;
  onClose: () => void;
  onEnrichmentApplied: (updatedBook: BookItem) => void;
}

export const EditionComparisonModal: React.FC<EditionComparisonModalProps> = ({
  isOpen,
  book,
  onClose,
  onEnrichmentApplied,
}) => {
  const { t, lang: language, dir } = useWorkspace();
  const isRtl = dir === 'rtl' || language === 'ar';

  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [candidates, setCandidates] = useState<EnrichmentCandidateEdition[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<EnrichmentCandidateEdition | null>(null);
  const [comparison, setComparison] = useState<EnrichmentComparison | null>(null);
  const [diagnostics, setDiagnostics] = useState<TechnicalSearchDiagnostics | null>(null);

  // User selections
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<Record<EnrichmentFieldKey, boolean>>({
    title: false,
    author: false,
    publisher: false,
    publicationYear: false,
    isbn: false,
    language: false,
    description: false,
    coverImage: false,
    categories: false,
    pagesCount: false,
  });

  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [downloadCoverLocally, setDownloadCoverLocally] = useState(true);
  const [attachDigitalCopy, setAttachDigitalCopy] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [previousComparisonTarget, setPreviousComparisonTarget] = useState<readonly unknown[] | null>(null);
  const inputsComparisonTarget = [isOpen, book];
  if (previousComparisonTarget === null || inputsComparisonTarget.some((value, index) => !Object.is(value, previousComparisonTarget[index]))) {
    setPreviousComparisonTarget(inputsComparisonTarget);
    if (isOpen && book) {
    setIsLoading(true);
    setErrorMessage(null);
    setCandidates([]);
    setSelectedCandidate(null);
    setComparison(null);
    }
  }
  // Fetch online candidates when modal opens
  useEffect(() => {
    if (!isOpen || !book) return;

    let isMounted = true;


    const fetchEditions = async () => {
      try {
        const windowAPI = (window).electronAPI;
        if (!windowAPI?.enrichment?.findOnlineEditions) {
          throw new Error('Enrichment API not available in current window');
        }

        const res = await windowAPI.enrichment.findOnlineEditions({
          workId: book.id,
          book,
        });

        if (isMounted) {
          const list: EnrichmentCandidateEdition[] = res.candidates || [];
          setCandidates(list);
          if (list.length > 0) {
            setSelectedCandidate(list[0]);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error('[baglib/ui] Error querying candidate editions:', err);
          setErrorMessage(getErrorMessage(err) || String(err));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchEditions();

    return () => {
      isMounted = false;
    };
  }, [isOpen, book]);

  const [previousComparisonSelection, setPreviousComparisonSelection] = useState<readonly unknown[] | null>(null);
  const inputsComparisonSelection = [selectedCandidate, book];
  if (previousComparisonSelection === null || inputsComparisonSelection.some((value, index) => !Object.is(value, previousComparisonSelection[index]))) {
    setPreviousComparisonSelection(inputsComparisonSelection);
    if (!selectedCandidate || !book) setComparison(null);
  }
  // Compute diffs whenever selected candidate changes
  useEffect(() => {
    if (!selectedCandidate || !book) {
      return;
    }

    const windowAPI = (window).electronAPI;
    if (windowAPI?.enrichment?.computeDiffs) {
      windowAPI.enrichment
        .computeDiffs({ book, candidate: selectedCandidate })
        .then((comp: EnrichmentComparison) => {
          setComparison(comp);

          // Default selection: select all new fields, deselect overwrites
          const initialSelection: Record<EnrichmentFieldKey, boolean> = {
            title: false,
            author: false,
            publisher: false,
            publicationYear: false,
            isbn: false,
            language: false,
            description: false,
            coverImage: false,
            categories: false,
            pagesCount: false,
          };

          let hasOverwrites = false;
          for (const [key, diff] of Object.entries(comp.diffs)) {
            const fKey = key as EnrichmentFieldKey;
            if (diff.hasIncoming) {
              if (!diff.hasCurrent) {
                initialSelection[fKey] = true;
              } else if (fKey === 'title' && diff.isDifferent) {
                initialSelection[fKey] = true;
                hasOverwrites = true;
              } else if (fKey === 'author' && diff.isDifferent && (!book.author || book.author === 'Unknown Author' || book.author === 'غير معروف')) {
                initialSelection[fKey] = true;
                hasOverwrites = true;
              }
            }
          }
          if (hasOverwrites) {
            setAllowOverwrite(true);
          }
          setSelectedFieldKeys(initialSelection);
        })
        .catch((err) => {
          console.warn('[baglib/ui] Compute diffs failed:', err);
        });
    }
  }, [selectedCandidate, book]);

  if (!isOpen) return null;

  const handleToggleField = (field: EnrichmentFieldKey) => {
    const diff = comparison?.diffs[field];
    if (!diff || !diff.hasIncoming) return;

    // If it's an overwrite and overwrite is not globally allowed, prompt/enable
    if (diff.isOverwriting && !allowOverwrite && !selectedFieldKeys[field]) {
      setAllowOverwrite(true);
    }

    setSelectedFieldKeys((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleSelectAllNew = () => {
    if (!comparison) return;
    const next: Record<EnrichmentFieldKey, boolean> = { ...selectedFieldKeys };
    for (const [key, diff] of Object.entries(comparison.diffs)) {
      const fKey = key as EnrichmentFieldKey;
      if (!diff.hasCurrent && diff.hasIncoming) {
        next[fKey] = true;
      } else {
        next[fKey] = false;
      }
    }
    setSelectedFieldKeys(next);
  };

  const handleSelectAll = () => {
    if (!comparison) return;
    const next: Record<EnrichmentFieldKey, boolean> = { ...selectedFieldKeys };
    for (const [key, diff] of Object.entries(comparison.diffs)) {
      const fKey = key as EnrichmentFieldKey;
      if (diff.hasIncoming && diff.isDifferent) {
        next[fKey] = true;
      }
    }
    setAllowOverwrite(true);
    setSelectedFieldKeys(next);
  };

  const handleDeselectAll = () => {
    setSelectedFieldKeys({
      title: false,
      author: false,
      publisher: false,
      publicationYear: false,
      isbn: false,
      language: false,
      description: false,
      coverImage: false,
      categories: false,
      pagesCount: false,
    });
  };

  const handleApply = async () => {
    if (!selectedCandidate || !comparison) return;

    const chosenFields = (Object.keys(selectedFieldKeys) as EnrichmentFieldKey[]).filter(
      (k) => selectedFieldKeys[k]
    );

    if (chosenFields.length === 0 && (!attachDigitalCopy || !selectedCandidate.downloadUrl)) {
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);

    try {
      const windowAPI = (window).electronAPI;
      const incomingValues: Partial<BookItem> = {};

      for (const field of chosenFields) {
        if (field === 'title') incomingValues.title = selectedCandidate.title;
        else if (field === 'author') incomingValues.author = selectedCandidate.authors?.join(', ');
        else if (field === 'publisher') incomingValues.publisher = selectedCandidate.publisher;
        else if (field === 'publicationYear') incomingValues.publicationYear = selectedCandidate.publicationYear;
        else if (field === 'isbn') incomingValues.isbn = selectedCandidate.isbn;
        else if (field === 'language') incomingValues.language = selectedCandidate.language;
        else if (field === 'description') incomingValues.description = selectedCandidate.description;
        else if (field === 'coverImage') incomingValues.coverImage = selectedCandidate.coverUrl;
        else if (field === 'categories') incomingValues.categories = selectedCandidate.subjects;
        else if (field === 'pagesCount') incomingValues.pagesCount = selectedCandidate.pageCount;
      }

      const req: ApplyEnrichmentRequest = {
        workId: book.id,
        candidateId: selectedCandidate.id,
        selectedFields: chosenFields,
        incomingValues,
        overwritePopulatedFields: allowOverwrite || chosenFields.includes('title'),
        downloadCoverLocally,
        attachDigitalCopy: attachDigitalCopy && Boolean(selectedCandidate.downloadUrl),
      };

      const result = await windowAPI.enrichment.applyMerge(req);

      // If user also wants to attach the digital copy from candidate downloadUrl
      if (attachDigitalCopy && selectedCandidate.downloadUrl && selectedCandidate.downloadFormat) {
        try {
          await windowAPI.enrichment.attachDigitalCopy({
            workId: book.id,
            downloadUrl: selectedCandidate.downloadUrl,
            format: selectedCandidate.downloadFormat,
            title: selectedCandidate.title,
          });
        } catch (copyErr) {
          console.warn('[baglib/ui] Warning: Could not attach digital copy:', copyErr);
        }
      }

      onEnrichmentApplied(result.updatedBook || book);
      onClose();
    } catch (err: unknown) {
      console.error('[baglib/ui] Apply enrichment failed:', err);
      setErrorMessage(getErrorMessage(err) || String(err));
    } finally {
      setIsApplying(false);
    }
  };

  const renderFieldValue = (val: unknown) => {
    if (val === undefined || val === null || val === '') {
      return <span className="text-gray-500 italic text-xs">—</span>;
    }
    if (Array.isArray(val)) {
      return (
        <div className="flex flex-wrap gap-1">
          {val.map((item, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 rounded text-[11px] bg-gray-800 text-gray-300 border border-gray-700"
            >
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    return <span className="text-xs text-gray-200 line-clamp-2">{String(val)}</span>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="relative w-full max-w-5xl max-h-[calc(100dvh-2rem)] flex flex-col bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide">
                {t('editionComparisonTitle')}
              </h2>
              <p className="text-xs text-gray-400">{t('editionComparisonSubtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Collapsible File & Query Diagnostics Panel */}
          <FileQueryDiagnosticsPanel
            diagnostics={diagnostics}
            filePath={book.filePath}
            fileSize={book.fileSize}
            searchTitle={book.title}
            searchAuthor={book.author}
            searchIsbn={book.isbn}
          />

          {/* Candidate Editions Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                {t('candidateEditions')} ({candidates.length})
              </h3>
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <span>{t('searchingEditions')}</span>
                </div>
              )}
            </div>

            {candidates.length === 0 && !isLoading ? (
              <div className="p-6 text-center border border-dashed border-gray-800 rounded-xl bg-gray-900/40">
                <p className="text-sm font-medium text-gray-400">{t('noEditionsFound')}</p>
                <p className="text-xs text-gray-500 mt-1">{t('noEditionsHint')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-56 overflow-y-auto p-1">
                {candidates.map((cand) => {
                  const isSelected = selectedCandidate?.id === cand.id;
                  const confidencePct = Math.round((cand.matchConfidence || 0) * 100);
                  return (
                    <div
                      key={cand.id}
                      onClick={() => setSelectedCandidate(cand)}
                      className={`cursor-pointer relative p-3 rounded-xl border transition flex gap-3 text-start ${
                        isSelected
                          ? 'bg-emerald-950/20 border-emerald-500/60 ring-1 ring-emerald-500/30'
                          : 'bg-gray-800/40 border-gray-800 hover:border-gray-700 hover:bg-gray-800/70'
                      }`}
                    >
                      <div className="w-12 h-16 bg-gray-950 rounded shrink-0 overflow-hidden border border-gray-800 flex items-center justify-center">
                        {cand.coverUrl ? (
                          <img
                            src={cand.coverUrl}
                            alt={cand.title}
                            className="w-full h-full object-cover"
                            onError={(e) => ((e.target as HTMLElement).style.display = 'none')}
                          />
                        ) : (
                          <span className="text-[10px] text-gray-600">No cover</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {cand.providerName}
                            </span>
                            {cand.matchConfidence !== undefined && (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[8px] font-bold border ${
                                  confidencePct >= 80
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : confidencePct >= 50
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-gray-800 text-gray-400 border-gray-700'
                                }`}
                              >
                                {confidencePct}% {language === 'ar' ? 'تطابق' : 'match'}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-semibold text-gray-200 truncate">{cand.title}</h4>
                          <p className="text-[11px] text-gray-400 truncate">
                            {cand.authors?.join(', ') || t('unknownAuthor')}
                          </p>

                          {/* Matched Factors Breakdown */}
                          {(cand.matchFactors || cand.matchReason) && (
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {cand.matchFactors?.isbnMatched && (
                                <span className="px-1 py-0.2 rounded text-[8px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  {t('factorIsbnMatch')}
                                </span>
                              )}
                              {cand.matchFactors?.titleSimilarity && cand.matchFactors.titleSimilarity > 0.5 && (
                                <span className="px-1 py-0.2 rounded text-[8px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  {Math.round(cand.matchFactors.titleSimilarity * 100)}% {t('factorTitleSimilarity')}
                                </span>
                              )}
                              {cand.matchFactors?.authorMatched && (
                                <span className="px-1 py-0.2 rounded text-[8px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  {t('factorAuthorMatch')}
                                </span>
                              )}
                              {!cand.matchFactors && cand.matchReason && (
                                <span className="text-[9px] text-gray-400 truncate">
                                  {cand.matchReason}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-gray-500 mt-1">
                          <span>{cand.publicationYear || cand.publisher || '—'}</span>
                          {cand.downloadFormat && (
                            <span className="text-purple-400 font-medium">{cand.downloadFormat}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Field Comparison Section */}
          {selectedCandidate && comparison && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    {t('comparingWithEdition', { provider: selectedCandidate.providerName })}
                  </h3>
                  {selectedCandidate.sourceUrl && (
                    <a
                      href={selectedCandidate.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:text-emerald-300 underline inline-flex items-center gap-1"
                    >
                      <span>{t('openProviderLink')}</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={handleSelectAllNew}
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                  >
                    {t('selectAllNewFields')} ({comparison.summary.newFieldsCount})
                  </button>
                  <button
                    onClick={handleSelectAll}
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition"
                  >
                    {t('selectAllFields')}
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition"
                  >
                    {t('deselectAll')}
                  </button>
                </div>
              </div>

              {/* Diff Table */}
              <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/60 divide-y divide-gray-800">
                <div className="grid grid-cols-12 px-4 py-2 bg-gray-800/40 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  <div className="col-span-1 text-center">✓</div>
                  <div className="col-span-2">{t('diffField')}</div>
                  <div className="col-span-4">{t('currentValue')}</div>
                  <div className="col-span-2 text-center">{t('actionLabel')}</div>
                  <div className="col-span-3">{t('incomingValue')}</div>
                </div>

                {(Object.keys(comparison.diffs) as EnrichmentFieldKey[]).map((fieldKey) => {
                  const diff = comparison.diffs[fieldKey];
                  const isChecked = Boolean(selectedFieldKeys[fieldKey]);
                  const canSelect = diff.hasIncoming;

                  return (
                    <div
                      key={fieldKey}
                      className={`grid grid-cols-12 px-4 py-3 items-center text-xs transition ${
                        isChecked ? 'bg-emerald-950/15' : 'hover:bg-gray-800/20'
                      }`}
                    >
                      <div className="col-span-1 flex justify-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={!canSelect}
                          onChange={() => handleToggleField(fieldKey)}
                          className="w-4 h-4 rounded border-gray-700 text-emerald-500 focus:ring-emerald-500/20 bg-gray-800"
                        />
                      </div>
                      <div className="col-span-2 font-medium text-gray-300">
                        {t(diff.labelKey as import('../../translations').TranslationKey) || fieldKey}
                      </div>
                      <div className="col-span-4 px-3">
                        {fieldKey === 'coverImage' && diff.currentValue ? (
                          <div className="w-8 h-11 rounded border border-gray-700 overflow-hidden">
                            <img src={String(diff.currentValue)} alt="current" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          renderFieldValue(diff.currentValue)
                        )}
                      </div>
                      <div className="col-span-2 flex justify-center">
                        {diff.isOverwriting ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                            {t('statusOverwrite')}
                          </span>
                        ) : !diff.hasCurrent && diff.hasIncoming ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            {t('statusNew')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] text-gray-500 bg-gray-800 border border-gray-700">
                            {t('statusIdentical')}
                          </span>
                        )}
                      </div>
                      <div className="col-span-3 px-3">
                        {fieldKey === 'coverImage' && diff.incomingValue ? (
                          <div className="w-8 h-11 rounded border border-emerald-500/40 overflow-hidden">
                            <img src={String(diff.incomingValue)} alt="candidate" className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          renderFieldValue(diff.incomingValue)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Safety & Action Controls */}
              <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-800 space-y-2.5">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={allowOverwrite}
                    onChange={(e) => setAllowOverwrite(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 text-amber-500 focus:ring-amber-500/20 bg-gray-800"
                  />
                  <span>{t('overwriteProtectionToggle')}</span>
                </label>
                {allowOverwrite && (
                  <p className="text-[11px] text-amber-400/90 px-6">
                    {t('overwriteWarningText')}
                  </p>
                )}

                <label className="flex items-center gap-2.5 cursor-pointer text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={downloadCoverLocally}
                    onChange={(e) => setDownloadCoverLocally(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-700 text-emerald-500 focus:ring-emerald-500/20 bg-gray-800"
                  />
                  <span>{t('downloadCoverLocallyOption')}</span>
                </label>

                {selectedCandidate.downloadUrl && selectedCandidate.downloadFormat && (
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs text-purple-300 font-medium">
                    <input
                      type="checkbox"
                      checked={attachDigitalCopy}
                      onChange={(e) => setAttachDigitalCopy(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-700 text-purple-500 focus:ring-purple-500/20 bg-gray-800"
                    />
                    <span>
                      {t('attachDigitalCopyOption', { format: selectedCandidate.downloadFormat })}
                    </span>
                  </label>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-gray-900/80">
          <button
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            {t('cancel')}
          </button>

          <button
            onClick={handleApply}
            disabled={isApplying || !selectedCandidate || Object.values(selectedFieldKeys).filter(Boolean).length === 0}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-950/40 transition"
          >
            {isApplying ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>{t('applyingBulkChanges')}</span>
              </>
            ) : (
              <span>{t('applySelectedChanges')}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
