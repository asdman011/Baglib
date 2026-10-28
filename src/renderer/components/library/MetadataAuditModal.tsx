'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Search,
  BookOpen,
  User,
  Calendar,
  Barcode,
  FileText,
  Layers,
  Globe,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Check,
  Building,
  Image as ImageIcon,
  StopCircle,
  RotateCcw,
  ListOrdered,
  Eye,
  FileCheck
} from 'lucide-react';
import { BookItem } from '../../types/library';
import { BibliographicWork } from '../../../shared/types/bibliographic';
import { isPlaceholderAuthor, isPlaceholderTitle } from '../../../shared/validators/metadata-validator';
import { useWorkspace } from '../context/WorkspaceContext';
import { renderPdfPage } from '../../utils/pdf-page-renderer';
import { formatCoverUrl } from '../../utils/file-path-helper';
import { useMetadataLookup, CandidateMetadataItem } from '../../hooks/useMetadataLookup';

export interface MetadataAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  booksToAudit: BookItem[];
  onUpdateBook: (updatedBook: BookItem) => Promise<void> | void;
  allCategories?: Array<{ id: string; nameAr: string; nameEn: string }>;
}

export interface MissingFieldsInfo {
  edition: boolean;
  author: boolean;
  year: boolean;
  cover: boolean;
  description: boolean;
  isbn: boolean;
  category: boolean;
  language: boolean;
  hasMissing: boolean;
  missingCount: number;
}

export function auditBook(book: BookItem): MissingFieldsInfo {
  const editionMissing = !book.edition?.trim();
  const authorMissing = !book.author || isPlaceholderAuthor(book.author);
  const yearMissing =
    !book.publicationYear ||
    String(book.publicationYear).trim() === '' ||
    Number(book.publicationYear) <= 0;
  const coverMissing = !book.coverImage || book.coverImage.trim() === '';
  const descriptionMissing = !book.description && !book.abstract;
  const isbnMissing = !book.isbn || book.isbn.trim() === '';
  const categoryMissing =
    (!book.categories ||
      book.categories.length === 0 ||
      (book.categories.length === 1 && book.categories[0] === 'ملفات رقمية محددة')) &&
    !book.primaryCategory;
  const languageMissing = !book.language || book.language.trim() === '';

  const missingFlags = [
    editionMissing,
    authorMissing,
    yearMissing,
    coverMissing,
    descriptionMissing,
    isbnMissing,
    categoryMissing,
    languageMissing,
  ];
  const missingCount = missingFlags.filter(Boolean).length;

  return {
    edition: editionMissing,
    author: authorMissing,
    year: yearMissing,
    cover: coverMissing,
    description: descriptionMissing,
    isbn: isbnMissing,
    category: categoryMissing,
    language: languageMissing,
    hasMissing: missingCount > 0,
    missingCount,
  };
}

export const MetadataAuditModal: React.FC<MetadataAuditModalProps> = ({
  isOpen,
  onClose,
  booksToAudit,
  onUpdateBook,
}) => {
  const { lang, dir, t } = useWorkspace();
  const ArrowIcon = dir === 'rtl' ? ArrowLeft : ArrowRight;

  // Local state of audited books (allows live update as fixes occur)
  const [auditedBooks, setAuditedBooks] = useState<BookItem[]>(booksToAudit);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTabFilter, setActiveTabFilter] = useState<
    'all' | 'needs_attention' | 'missing_author' | 'missing_year' | 'missing_cover' | 'missing_desc' | 'missing_isbn_cat' | 'clean'
  >('all');

  // Track resolution sources for instant visual feedback: id -> 'local' | 'online'
  const [resolvedStatus, setResolvedStatus] = useState<Record<string, 'local' | 'online'>>({});

  // Action 1: Re-scan local files state
  const [isRescanning, setIsRescanning] = useState(false);
  const [rescanProgress, setRescanProgress] = useState<{ current: number; total: number; title: string }>({
    current: 0,
    total: 0,
    title: '',
  });
  const abortRescanRef = useRef(false);

  // Action 2.1: Auto-enrich all state
  const [isEnrichingAll, setIsEnrichingAll] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{
    current: number;
    total: number;
    title: string;
    enrichedCount: number;
    skippedCount: number;
  }>({
    current: 0,
    total: 0,
    title: '',
    enrichedCount: 0,
    skippedCount: 0,
  });
  const abortEnrichRef = useRef(false);

  // Action 2.2: Review One by One state
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);

  // Candidate lookup hook for Review One by One
  const reviewLookup = useMetadataLookup();
  const [selectedCandidate, setSelectedCandidate] = useState<BibliographicWork | null>(null);

  // Toast / notification banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Synchronize when booksToAudit prop changes
  const [previousResetInputs1, setPreviousResetInputs1] = useState<readonly unknown[] | null>(null);
  const resetInputs1 = [booksToAudit];
  if (previousResetInputs1 === null || resetInputs1.some((value, index) => !Object.is(value, previousResetInputs1[index]))) {
    setPreviousResetInputs1(resetInputs1);

    setAuditedBooks(booksToAudit);

  }

  // Derived missing audits map
  const auditMap = useMemo(() => {
    const map = new Map<string, MissingFieldsInfo>();
    auditedBooks.forEach((b) => {
      map.set(b.id, auditBook(b));
    });
    return map;
  }, [auditedBooks]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = auditedBooks.length;
    let needsAttention = 0;
    let clean = 0;
    let missingAuthor = 0;
    let missingYear = 0;
    let missingCover = 0;
    let missingDesc = 0;
    let missingIsbnCat = 0;

    auditedBooks.forEach((b) => {
      const a = auditMap.get(b.id) || auditBook(b);
      if (a.hasMissing) {
        needsAttention++;
      } else {
        clean++;
      }
      if (a.author) missingAuthor++;
      if (a.year) missingYear++;
      if (a.cover) missingCover++;
      if (a.description) missingDesc++;
      if (a.isbn || a.category || a.language) missingIsbnCat++;
    });

    return {
      total,
      needsAttention,
      clean,
      missingAuthor,
      missingYear,
      missingCover,
      missingDesc,
      missingIsbnCat,
    };
  }, [auditedBooks, auditMap]);

  // Filtered books to display in audit table
  const displayedBooks = useMemo(() => {
    return auditedBooks.filter((book) => {
      const audit = auditMap.get(book.id) || auditBook(book);

      // Tab filter
      if (activeTabFilter === 'needs_attention' && !audit.hasMissing) return false;
      if (activeTabFilter === 'clean' && audit.hasMissing) return false;
      if (activeTabFilter === 'missing_author' && !audit.author) return false;
      if (activeTabFilter === 'missing_year' && !audit.year) return false;
      if (activeTabFilter === 'missing_cover' && !audit.cover) return false;
      if (activeTabFilter === 'missing_desc' && !audit.description) return false;
      if (activeTabFilter === 'missing_isbn_cat' && !(audit.isbn || audit.category || audit.language)) return false;

      // Search query
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const titleMatch = book.title.toLowerCase().includes(q);
        const authorMatch = book.author?.toLowerCase().includes(q);
        const isbnMatch = book.isbn?.toLowerCase().includes(q);
        return titleMatch || authorMatch || isbnMatch;
      }

      return true;
    });
  }, [auditedBooks, auditMap, activeTabFilter, searchFilter]);

  // Flagged books for Review One by One
  const flaggedBooksForReview = useMemo(() => {
    return auditedBooks.filter((b) => (auditMap.get(b.id) || auditBook(b)).hasMissing);
  }, [auditedBooks, auditMap]);

  // Handle Review One by One book switch
  const currentReviewBook = flaggedBooksForReview[currentReviewIndex] || null;

  const [previousReviewTarget, setPreviousReviewTarget] = useState<readonly unknown[] | null>(null);
  const inputsReviewTarget = [isReviewMode, currentReviewBook?.id];
  if (previousReviewTarget === null || inputsReviewTarget.some((value, index) => !Object.is(value, previousReviewTarget[index]))) {
    setPreviousReviewTarget(inputsReviewTarget);
    setSelectedCandidate(null);
  }
  useEffect(() => {
    if (isReviewMode && currentReviewBook) {
      const isPlaceholder = isPlaceholderAuthor(currentReviewBook.author);
      reviewLookup.lookupWithCandidates({
        title: currentReviewBook.title,
        author: isPlaceholder ? undefined : currentReviewBook.author,
        isbn: currentReviewBook.isbn,
        filePath: currentReviewBook.filePath,
      });
    }
  }, [isReviewMode, currentReviewIndex, currentReviewBook?.id]);

  const [previousResetInputs2, setPreviousResetInputs2] = useState<readonly unknown[] | null>(null);
  const resetInputs2 = [reviewLookup.candidates];
  if (previousResetInputs2 === null || resetInputs2.some((value, index) => !Object.is(value, previousResetInputs2[index]))) {
    setPreviousResetInputs2(resetInputs2);

    if (reviewLookup.candidates.length > 0 && !selectedCandidate) {
      setSelectedCandidate(reviewLookup.candidates[0]);
    }

  }

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), 4500);
  };

  // --------------------------------------------------------------------------
  // ACTION 1: Re-scan Local Files First
  // --------------------------------------------------------------------------
  const handleRescanFiles = async () => {
    const windowAPI = typeof window !== 'undefined' ? (window).electronAPI : null;
    const candidates = auditedBooks.filter((b) => {
      const a = auditMap.get(b.id) || auditBook(b);
      return a.hasMissing && Boolean(b.filePath);
    });

    if (candidates.length === 0) {
      showToast(t('noLocalFilesFound'));
      return;
    }

    setIsRescanning(true);
    abortRescanRef.current = false;
    let resolvedCount = 0;

    try {
      for (let i = 0; i < candidates.length; i++) {
        if (abortRescanRef.current) break;

        const book = candidates[i];
        setRescanProgress({ current: i + 1, total: candidates.length, title: book.title });

        try {
          const fileName = book.filePath!.split(/[\\/]/).pop();
          let discovered: Awaited<ReturnType<typeof window.electronAPI.discoverMetadata>> | null = null;

          if (windowAPI?.extractOfflineMetadata) {
            discovered = await windowAPI.extractOfflineMetadata({
              filePath: book.filePath,
              filename: fileName,
            });
          } else if (windowAPI?.discoverMetadata) {
            discovered = await windowAPI.discoverMetadata({
              filePath: book.filePath,
              filename: fileName,
              offlineOnly: true,
            });
          }

          const updatedBook = { ...book };
          let changed = false;
          const audit = auditMap.get(book.id) || auditBook(book);

          // Author
          if (audit.author) {
            let candidateAuthor: string | null = null;
            if (discovered?.authors && discovered.authors.length > 0) {
              candidateAuthor = discovered.authors.join(', ');
            } else if (discovered?.author) {
              candidateAuthor = discovered.author;
            }
            if (candidateAuthor && !isPlaceholderAuthor(candidateAuthor)) {
              updatedBook.author = candidateAuthor;
              changed = true;
            }
          }

          // Year
          if (audit.year && discovered?.publicationYear) {
            const yr = parseInt(String(discovered.publicationYear), 10);
            if (!isNaN(yr) && yr > 0) {
              updatedBook.publicationYear = yr;
              changed = true;
            }
          }

          // ISBN
          if (audit.isbn && discovered?.isbn) {
            updatedBook.isbn = discovered.isbn;
            changed = true;
          }

          // Description
          if (audit.description && (discovered?.description || discovered?.abstract)) {
            updatedBook.description = discovered.description || discovered.abstract;
            changed = true;
          }

          // Language
          if (audit.language && discovered?.language) {
            updatedBook.language = discovered.language;
            changed = true;
          }

          // Pages Count
          if ((!updatedBook.pagesCount || updatedBook.pagesCount <= 0) && discovered?.pagesCount) {
            updatedBook.pagesCount = discovered.pagesCount;
            changed = true;
          }

          // Publisher
          if ((!updatedBook.publisher || updatedBook.publisher === '') && discovered?.publisher) {
            updatedBook.publisher = discovered.publisher;
            changed = true;
          }

          // Edition
          if (!updatedBook.edition?.trim() && discovered?.edition?.trim()) {
            updatedBook.edition = discovered.edition;
            if (discovered.editionDetails?.rawMatch) {
              updatedBook.editionRawMatch = discovered.editionDetails.rawMatch;
              updatedBook.editionSource = discovered.editionDetails.source;
              updatedBook.editionConfidence = discovered.editionDetails.confidence;
            }
            changed = true;
          }

          // Cover Image: offline container, EPUB 5-tier extraction, or PDF raster extraction
          if (audit.cover) {
            let cover = discovered?.coverUrl || discovered?.coverImage;
            const isPdf =
              book.digitalFormat === 'PDF' ||
              Boolean(book.filePath && book.filePath.toLowerCase().endsWith('.pdf'));
            const isEpub =
              book.digitalFormat === 'EPUB' ||
              Boolean(book.filePath && book.filePath.toLowerCase().endsWith('.epub'));

            if (!cover && isPdf && book.filePath) {
              try {
                if (windowAPI?.extractPdfCover) {
                  const extRes = await windowAPI.extractPdfCover(book.filePath, 1);
                  if (extRes?.success && extRes.coverUrl) cover = extRes.coverUrl;
                }
                if (!cover) {
                  const pdfRes = await renderPdfPage(book.filePath, 1);
                  if (pdfRes?.success && pdfRes.coverUrl) cover = pdfRes.coverUrl;
                }
              } catch (pdfErr) {
                console.warn('[MetadataAuditModal] PDF cover render error:', pdfErr);
              }
            } else if (!cover && isEpub && book.filePath) {
              try {
                if (windowAPI?.extractEpubCover) {
                  const extRes = await windowAPI.extractEpubCover(book.filePath);
                  if (extRes?.success && extRes.coverUrl) cover = extRes.coverUrl;
                }
              } catch (epubErr) {
                console.warn('[MetadataAuditModal] EPUB cover extraction error:', epubErr);
              }
            }

            if (cover) {
              updatedBook.coverImage = cover;
              changed = true;
            }
          }

          if (changed) {
            // Strictly preserve user custom notes and tags
            updatedBook.tags = book.tags;

            await onUpdateBook(updatedBook);
            setAuditedBooks((prev) => prev.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
            setResolvedStatus((prev) => ({ ...prev, [updatedBook.id]: 'local' }));
            resolvedCount++;
          }
        } catch (itemErr) {
          console.warn('[MetadataAuditModal] Local scan failed for item:', book.title, itemErr);
        }
      }
    } finally {
      setIsRescanning(false);
      showToast(t('rescanFilesSuccess', { count: resolvedCount }));
    }
  };

  // --------------------------------------------------------------------------
  // ACTION 2.1: Auto-Enrich All Online (Background loop with 1s pacing)
  // --------------------------------------------------------------------------
  const handleAutoEnrichAll = async () => {
    const windowAPI = typeof window !== 'undefined' ? (window).electronAPI : null;
    const candidates = auditedBooks.filter((b) => {
      const a = auditMap.get(b.id) || auditBook(b);
      return a.hasMissing;
    });

    if (candidates.length === 0) {
      showToast(t('allMetadataClean'));
      return;
    }

    setIsEnrichingAll(true);
    abortEnrichRef.current = false;
    let enrichedCount = 0;
    let skippedCount = 0;

    setEnrichProgress({
      current: 0,
      total: candidates.length,
      title: '',
      enrichedCount: 0,
      skippedCount: 0,
    });

    try {
      for (let i = 0; i < candidates.length; i++) {
        if (abortEnrichRef.current) break;

        const book = candidates[i];
        setEnrichProgress({
          current: i + 1,
          total: candidates.length,
          title: book.title,
          enrichedCount,
          skippedCount,
        });

        try {
          const isPlaceholder = isPlaceholderAuthor(book.author);
          let discovery: Awaited<ReturnType<typeof window.electronAPI.discoverMetadata>> | null = null;

          if (windowAPI?.discoverMetadata) {
            discovery = await windowAPI.discoverMetadata({
              title: book.title,
              author: isPlaceholder ? undefined : book.author,
              isbn: book.isbn,
              filePath: book.filePath,
            });
          }

          // Apply only on verified match or high confidence (>= 0.75)
          const isHighConfidence = discovery && (discovery.isVerifiedMatch || (discovery.confidence || 0) >= 0.75);

          if (isHighConfidence) {
            const updatedBook = { ...book };
            const audit = auditMap.get(book.id) || auditBook(book);

            if (discovery.title && discovery.title.trim()) {
              const isPlaceholder = isPlaceholderTitle(updatedBook.title);
              const isFilename = Boolean(
                updatedBook.filePath &&
                updatedBook.title.replace(/\.[^/.]+$/, '').trim().toLowerCase() ===
                  updatedBook.filePath.split(/[/\\]/).pop()?.replace(/\.[^/.]+$/, '').trim().toLowerCase()
              );
              if (isPlaceholder || isFilename || discovery.isVerifiedMatch) {
                updatedBook.title = discovery.title.trim();
              }
            }

            if (audit.author && discovery.authors && discovery.authors.length > 0) {
              const candAuthor = discovery.authors.join(', ');
              if (!isPlaceholderAuthor(candAuthor)) updatedBook.author = candAuthor;
            }
            if (audit.year && discovery.publicationYear) {
              const yr = parseInt(String(discovery.publicationYear), 10);
              if (!isNaN(yr) && yr > 0) updatedBook.publicationYear = yr;
            }
            if (audit.cover && discovery.coverUrl) {
              updatedBook.coverImage = discovery.coverUrl;
            }
            if (audit.description && discovery.description) {
              updatedBook.description = discovery.description;
            }
            if (audit.isbn && discovery.isbn) {
              updatedBook.isbn = discovery.isbn;
            }
            if (audit.language && discovery.language) {
              updatedBook.language = discovery.language;
            }
            if ((!updatedBook.publisher || updatedBook.publisher === '') && discovery.publisher) {
              updatedBook.publisher = discovery.publisher;
            }
            if ((!updatedBook.pagesCount || updatedBook.pagesCount <= 0) && discovery.pagesCount) {
              updatedBook.pagesCount = discovery.pagesCount;
            }
            if (!updatedBook.edition?.trim() && discovery.edition?.trim()) {
              updatedBook.edition = discovery.edition;
              if (discovery.editionDetails?.rawMatch) {
                updatedBook.editionRawMatch = discovery.editionDetails.rawMatch;
                updatedBook.editionSource = discovery.editionDetails.source;
                updatedBook.editionConfidence = discovery.editionDetails.confidence;
              }
            }

            // Strictly preserve custom notes, tags, and reading progress
            updatedBook.tags = book.tags;

            await onUpdateBook(updatedBook);
            setAuditedBooks((prev) => prev.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
            setResolvedStatus((prev) => ({ ...prev, [updatedBook.id]: 'online' }));
            enrichedCount++;
          } else {
            skippedCount++;
          }
        } catch (itemErr) {
          console.warn('[MetadataAuditModal] Auto-enrich online error:', book.title, itemErr);
          skippedCount++;
        }

        // Mandatory rate-limiting delay: 1000ms between calls
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      setIsEnrichingAll(false);
      if (abortEnrichRef.current) {
        showToast(t('autoEnrichCancelled'));
      } else {
        showToast(t('autoEnrichSuccess', { count: enrichedCount }));
      }
    }
  };

  // --------------------------------------------------------------------------
  // ACTION 2.2: Review One by One Handlers
  // --------------------------------------------------------------------------
  const handleStartReviewOneByOne = (startIndex = 0) => {
    if (flaggedBooksForReview.length === 0) {
      showToast(t('allMetadataClean'));
      return;
    }
    setCurrentReviewIndex(startIndex);
    setIsReviewMode(true);
  };

  const handleApproveCandidate = async () => {
    if (!currentReviewBook || !selectedCandidate) return;

    const audit = auditMap.get(currentReviewBook.id) || auditBook(currentReviewBook);
    const primaryEdition = selectedCandidate.editions?.[0];
    const updatedBook: BookItem = { ...currentReviewBook };

    if (selectedCandidate.title && selectedCandidate.title.trim()) {
      updatedBook.title = selectedCandidate.title.trim();
    }
    if (selectedCandidate.authors && selectedCandidate.authors.length > 0) {
      const authStr = selectedCandidate.authors.join(', ');
      if (!isPlaceholderAuthor(authStr)) updatedBook.author = authStr;
    }
    if (selectedCandidate.firstPublishYear || primaryEdition?.publishDate) {
      const yr =
        selectedCandidate.firstPublishYear ||
        (primaryEdition?.publishDate ? parseInt(primaryEdition.publishDate.substring(0, 4), 10) : undefined);
      if (yr && !isNaN(yr) && yr > 0) updatedBook.publicationYear = yr;
    }
    const candCover =
      primaryEdition?.coverUrl ||
      selectedCandidate.editions?.find((e) => Boolean(e.coverUrl))?.coverUrl;
    if (candCover) {
      updatedBook.coverImage = candCover;
    }
    if (selectedCandidate.description) {
      updatedBook.description = selectedCandidate.description;
    }
    const candIsbn = primaryEdition?.isbn13 || primaryEdition?.isbn || primaryEdition?.isbn10;
    if (candIsbn) {
      updatedBook.isbn = candIsbn;
    }
    if (primaryEdition?.language) {
      updatedBook.language = primaryEdition.language;
    }
    const candPublisher = primaryEdition?.publisher || ('publisher' in selectedCandidate ? String(selectedCandidate.publisher) : undefined);
    if (candPublisher) {
      updatedBook.publisher = candPublisher;
    }
    if (primaryEdition?.pages) {
      updatedBook.pagesCount = primaryEdition.pages;
    }

    // Preserve custom tags and notes
    updatedBook.tags = currentReviewBook.tags;

    await onUpdateBook(updatedBook);
    setAuditedBooks((prev) => prev.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
    setResolvedStatus((prev) => ({ ...prev, [updatedBook.id]: 'online' }));

    // Move to next flagged book or finish
    if (currentReviewIndex < flaggedBooksForReview.length - 1) {
      setCurrentReviewIndex((i) => i + 1);
    } else {
      setIsReviewMode(false);
      showToast(lang === 'ar' ? 'اكتملت مراجعة جميع الكتب بنجاح!' : 'Review completed successfully!');
    }
  };

  const handleSkipReviewBook = () => {
    if (currentReviewIndex < flaggedBooksForReview.length - 1) {
      setCurrentReviewIndex((i) => i + 1);
    } else {
      setIsReviewMode(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-surface border border-subtle shadow-2xl overflow-hidden font-sans text-main">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-subtle bg-surface-raised/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-sm shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-display leading-none">
                  {t('auditMetadataTitle')}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 text-[11px] font-bold">
                  {booksToAudit.length < (auditedBooks.length || 1) || booksToAudit.length === 1
                    ? t('auditScopeSelected', { count: booksToAudit.length })
                    : t('auditScopeAll', { count: auditedBooks.length })}
                </span>
              </div>
              <p className="text-xs text-muted mt-1 max-w-xl">{t('auditMetadataSubtitle')}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-canvas border border-subtle text-muted hover:text-main hover:bg-surface flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast / Status banner */}
        {toastMessage && (
          <div className="px-6 py-2.5 bg-pale-sky-500 text-white text-xs font-semibold flex items-center justify-between animate-slide-down">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4" />
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-white/80 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Live Re-scan Progress Banner */}
        {isRescanning && (
          <div className="px-6 py-3 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
              <div>
                <span className="font-bold">
                  {t('rescanningFiles', { current: rescanProgress.current, total: rescanProgress.total })}
                </span>
                <span className="text-muted ms-2 truncate max-w-md inline-block align-bottom font-serif">
                  {rescanProgress.title}
                </span>
              </div>
            </div>
            <button
              onClick={() => (abortRescanRef.current = true)}
              className="px-2.5 py-1 rounded-lg bg-surface border border-subtle text-red-500 font-bold hover:bg-red-500/10 transition-colors text-[11px] cursor-pointer"
            >
              {t('stopEnrichment')}
            </button>
          </div>
        )}

        {/* Live Auto-Enrich Progress Banner */}
        {isEnrichingAll && (
          <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                <span className="font-bold">
                  {t('autoEnrichProgress', {
                    current: enrichProgress.current,
                    total: enrichProgress.total,
                    title: enrichProgress.title,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted">
                  تم التحديث: <strong className="text-emerald-500">{enrichProgress.enrichedCount}</strong> | تم التخطي:{' '}
                  <strong className="text-muted">{enrichProgress.skippedCount}</strong>
                </span>
                <button
                  onClick={() => (abortEnrichRef.current = true)}
                  className="px-2.5 py-1 rounded-lg bg-surface border border-subtle text-red-500 font-bold hover:bg-red-500/10 transition-colors text-[11px] cursor-pointer"
                >
                  {t('stopEnrichment')}
                </button>
              </div>
            </div>
            {/* Visual progress bar */}
            <div className="w-full bg-canvas rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${enrichProgress.total > 0 ? (enrichProgress.current / enrichProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* MAIN BODY: Table View vs Sequential Guided Review View */}
        {!isReviewMode ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Action Bar (Re-scan Local + Online Options) */}
            <div className="p-4 sm:p-5 border-b border-subtle bg-surface space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Stats Summary Badges */}
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle">
                    <span className="text-muted">{t('auditStatTotal')}:</span>
                    <strong className="text-main font-mono">{stats.total}</strong>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{t('auditStatIssues')}:</span>
                    <strong className="font-mono">{stats.needsAttention}</strong>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t('auditStatClean')}:</span>
                    <strong className="font-mono">{stats.clean}</strong>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Action 1: Re-scan local files */}
                  <button
                    type="button"
                    disabled={isRescanning || isEnrichingAll}
                    onClick={handleRescanFiles}
                    title={t('rescanFilesFirstDesc')}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-500/20 disabled:opacity-50 transition-all cursor-pointer shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} />
                    <span>{t('rescanFilesFirst')}</span>
                  </button>

                  {/* Action 2.1: Auto-enrich all */}
                  <button
                    type="button"
                    disabled={isEnrichingAll || isRescanning || stats.needsAttention === 0}
                    onClick={handleAutoEnrichAll}
                    title={t('autoEnrichAllDesc')}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 disabled:opacity-50 shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('autoEnrichAll')}</span>
                  </button>

                  {/* Action 2.2: Review One by One */}
                  <button
                    type="button"
                    disabled={stats.needsAttention === 0 || isEnrichingAll || isRescanning}
                    onClick={() => handleStartReviewOneByOne(0)}
                    title={t('reviewOneByOneDesc')}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 disabled:opacity-50 shadow-md shadow-pale-sky-500/20 transition-all cursor-pointer"
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                    <span>{t('reviewOneByOne')}</span>
                  </button>
                </div>
              </div>

              {/* Filters & Search Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {/* Filter chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('all')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      activeTabFilter === 'all'
                        ? 'bg-pale-sky-500 text-white shadow-sm'
                        : 'bg-canvas border border-subtle text-muted hover:text-main'
                    }`}
                  >
                    {t('auditFilterAll', { count: stats.total })}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('needs_attention')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      activeTabFilter === 'needs_attention'
                        ? 'bg-amber-500 text-white shadow-sm'
                        : 'bg-canvas border border-subtle text-amber-600 dark:text-amber-400 hover:text-main'
                    }`}
                  >
                    <span>{t('auditFilterNeedsAttention', { count: stats.needsAttention })}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('missing_author')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      activeTabFilter === 'missing_author'
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'bg-canvas border border-subtle text-muted hover:text-main'
                    }`}
                  >
                    {t('auditMissingAuthor')} ({stats.missingAuthor})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('missing_year')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      activeTabFilter === 'missing_year'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-canvas border border-subtle text-muted hover:text-main'
                    }`}
                  >
                    {t('auditMissingYear')} ({stats.missingYear})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('missing_cover')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      activeTabFilter === 'missing_cover'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-canvas border border-subtle text-muted hover:text-main'
                    }`}
                  >
                    {t('auditMissingCover')} ({stats.missingCover})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTabFilter('clean')}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      activeTabFilter === 'clean'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-canvas border border-subtle text-muted hover:text-main'
                    }`}
                  >
                    {t('auditFilterClean', { count: stats.clean })}
                  </button>
                </div>

                {/* Instant Search */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-muted absolute top-1/2 -translate-y-1/2 start-3" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder={t('auditSearchPlaceholder')}
                    className="w-full ps-9 pe-3 py-1.5 rounded-xl bg-canvas border border-subtle text-xs text-main placeholder:text-muted outline-none focus:border-pale-sky-500 transition-colors"
                  />
                  {searchFilter && (
                    <button
                      onClick={() => setSearchFilter('')}
                      className="absolute top-1/2 -translate-y-1/2 end-2 text-muted hover:text-main cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Audited Books Table */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {displayedBooks.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-canvas border border-subtle flex items-center justify-center text-muted">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className="font-bold text-sm text-main">{t('allMetadataClean')}</h3>
                  <p className="text-xs text-muted max-w-md">{t('noBooksInAudit')}</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {displayedBooks.map((book) => {
                    const audit = auditMap.get(book.id) || auditBook(book);
                    const resolution = resolvedStatus[book.id];

                    return (
                      <div
                        key={book.id}
                        className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                          resolution
                            ? 'bg-emerald-500/5 border-emerald-500/30 ring-1 ring-emerald-500/20'
                            : audit.hasMissing
                            ? 'bg-surface border-subtle hover:border-amber-500/40'
                            : 'bg-surface/50 border-subtle/60'
                        }`}
                      >
                        {/* Book Info */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Cover Thumbnail */}
                          <div className="w-12 h-16 rounded-lg bg-canvas border border-subtle overflow-hidden flex items-center justify-center shrink-0 shadow-inner relative">
                            {book.coverImage ? (
                              <img
                                src={formatCoverUrl(book.coverImage)}
                                alt={book.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <BookOpen className="w-5 h-5 text-muted opacity-30" />
                            )}
                            {audit.cover && (
                              <div
                                title={t('auditMissingCover')}
                                className="absolute top-1 start-1 w-2.5 h-2.5 rounded-full bg-purple-500 ring-2 ring-surface"
                              />
                            )}
                          </div>

                          {/* Meta Details */}
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xs sm:text-sm text-main truncate" title={book.title}>
                                {book.title}
                              </h4>
                              {book.digitalFormat && (
                                <span className="px-1.5 py-0.2 rounded bg-canvas border border-subtle font-mono text-[9px] text-muted shrink-0">
                                  {book.digitalFormat}
                                </span>
                              )}
                              {resolution && (
                                <span className="px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] shrink-0 flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>
                                    {resolution === 'local'
                                      ? t('auditLocalFileResolved')
                                      : t('auditOnlineResolved')}
                                  </span>
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-muted font-serif truncate">
                              {audit.author ? (
                                <span className="text-red-500 font-semibold">{t('auditMissingAuthor')}</span>
                              ) : (
                                book.author
                              )}
                              <span className="mx-2 text-muted/40">•</span>
                              {audit.year ? (
                                <span className="text-amber-500 font-semibold">{t('auditMissingYear')}</span>
                              ) : (
                                book.publicationYear
                              )}
                            </p>

                            {/* Missing Badges / Chips */}
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {audit.author && (
                                <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold border border-red-500/20">
                                  {t('auditMissingAuthor')}
                                </span>
                              )}
                              {audit.year && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold border border-amber-500/20">
                                  {t('auditMissingYear')}
                                </span>
                              )}
                              {audit.cover && (
                                <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold border border-purple-500/20">
                                  {t('auditMissingCover')}
                                </span>
                              )}
                              {audit.description && (
                                <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-bold border border-sky-500/20">
                                  {t('auditMissingDescription')}
                                </span>
                              )}
                              {audit.isbn && (
                                <span className="px-2 py-0.5 rounded-md bg-canvas text-muted text-[10px] font-mono border border-subtle">
                                  {t('auditMissingIsbn')}
                                </span>
                              )}
                              {audit.category && (
                                <span className="px-2 py-0.5 rounded-md bg-canvas text-muted text-[10px] border border-subtle">
                                  {t('auditMissingCategory')}
                                </span>
                              )}
                              {audit.edition && <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">{t('auditMissingEdition')}</span>}
                              {audit.language && (
                                <span className="px-2 py-0.5 rounded-md bg-canvas text-muted text-[10px] border border-subtle">
                                  {t('auditMissingLanguage')}
                                </span>
                              )}
                              {!audit.hasMissing && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                                  <Check className="w-3 h-3" />
                                  <span>{t('auditStatClean')}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Row Actions */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          {audit.hasMissing && (
                            <button
                              type="button"
                              onClick={() => {
                                const idx = flaggedBooksForReview.findIndex((b) => b.id === book.id);
                                if (idx >= 0) handleStartReviewOneByOne(idx);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/25 text-pale-sky-600 dark:text-pale-sky-400 font-bold text-xs hover:bg-pale-sky-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>{t('reviewOneByOne')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* SEQUENTIAL GUIDED REVIEW: "Review One by One"                             */
          /* ========================================================================= */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Review Stepper Header */}
            <div className="p-4 sm:p-5 border-b border-subtle bg-surface flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-pale-sky-500/15 border border-pale-sky-500/30 text-pale-sky-600 dark:text-pale-sky-400 text-xs font-bold font-mono">
                  {t('reviewBookStep', {
                    current: currentReviewIndex + 1,
                    total: flaggedBooksForReview.length,
                  })}
                </span>
                <h3 className="font-bold text-sm sm:text-base text-main truncate max-w-md">
                  {currentReviewBook?.title}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSkipReviewBook}
                  className="px-3.5 py-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:text-main font-semibold text-xs transition-colors cursor-pointer"
                >
                  {t('skipBook')}
                </button>

                <button
                  type="button"
                  onClick={() => setIsReviewMode(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-surface border border-subtle text-muted hover:text-main font-semibold text-xs transition-colors cursor-pointer"
                >
                  {t('exitReview')}
                </button>
              </div>
            </div>

            {/* Review Content: Book Missing Summary + Candidate Picker */}
            <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Current Book & Missing Fields */}
              <div className="lg:col-span-4 space-y-4">
                <div className="p-4 rounded-2xl bg-canvas border border-subtle space-y-4">
                  <div className="flex gap-3">
                    <div className="w-16 h-24 rounded-xl bg-surface border border-subtle overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                      {currentReviewBook?.coverImage ? (
                        <img
                          src={formatCoverUrl(currentReviewBook.coverImage)}
                          alt={currentReviewBook.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <BookOpen className="w-6 h-6 text-muted opacity-30" />
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <h4 className="font-bold text-sm text-main line-clamp-2">{currentReviewBook?.title}</h4>
                      <p className="text-xs text-muted font-serif">
                        {currentReviewBook && auditBook(currentReviewBook).author ? (
                          <span className="text-red-500 font-bold">{t('auditMissingAuthor')}</span>
                        ) : (
                          currentReviewBook?.author
                        )}
                      </p>
                      {currentReviewBook?.filePath && (
                        <p className="text-[10px] text-muted font-mono truncate" title={currentReviewBook.filePath}>
                          {currentReviewBook.filePath.split(/[\\/]/).pop()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-subtle text-xs">
                    <span className="text-muted font-bold text-[11px] block">{t('reviewMissingFields')}</span>
                    {currentReviewBook && (
                      <div className="flex flex-wrap gap-1.5">
                        {auditBook(currentReviewBook).author && (
                          <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold">
                            {t('auditMissingAuthor')}
                          </span>
                        )}
                        {auditBook(currentReviewBook).year && (
                          <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">
                            {t('auditMissingYear')}
                          </span>
                        )}
                        {auditBook(currentReviewBook).edition && <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-bold">{t('auditMissingEdition')}</span>}
                        {auditBook(currentReviewBook).cover && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-bold">
                            {t('auditMissingCover')}
                          </span>
                        )}
                        {auditBook(currentReviewBook).description && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-bold">
                            {t('auditMissingDescription')}
                          </span>
                        )}
                        {auditBook(currentReviewBook).isbn && (
                          <span className="px-2 py-0.5 rounded-md bg-canvas border border-subtle text-muted text-[10px] font-mono">
                            {t('auditMissingIsbn')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Approve Button */}
                <button
                  type="button"
                  disabled={!selectedCandidate}
                  onClick={handleApproveCandidate}
                  className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{t('approveAndNext')}</span>
                </button>
              </div>

              {/* Right Column: Metadata Candidates Picker */}
              <div className="lg:col-span-8 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-muted uppercase tracking-wider">
                    {t('candidatesModalTitle')} ({reviewLookup.candidates.length})
                  </h4>
                  {reviewLookup.status === 'searching' && (
                    <div className="flex items-center gap-1.5 text-xs text-pale-sky-500 font-semibold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t('candidateSearchingDeeper')}</span>
                    </div>
                  )}
                </div>

                {reviewLookup.status === 'searching' ? (
                  <div className="p-8 rounded-2xl bg-canvas border border-subtle flex flex-col items-center justify-center text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-pale-sky-500" />
                    <p className="text-xs text-muted">{t('candidateSearchingDeeper')}</p>
                  </div>
                ) : reviewLookup.candidates.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-canvas border border-subtle flex flex-col items-center justify-center text-center space-y-2">
                    <AlertTriangle className="w-6 h-6 text-amber-500" />
                    <h5 className="font-bold text-xs text-main">{t('candidateNoResults')}</h5>
                    <p className="text-[11px] text-muted max-w-sm">{t('candidateNoResultsHint')}</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pe-1">
                    {reviewLookup.candidates.map((cand, idx) => {
                      const isSelected = selectedCandidate?.workId === cand.workId;
                      const edition = cand.editions?.[0];
                      const evalItem = reviewLookup.evaluations.find((e) => e.work.workId === cand.workId);

                      return (
                        <div
                          key={cand.workId || idx}
                          onClick={() => setSelectedCandidate(cand)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex gap-3.5 ${
                            isSelected
                              ? 'bg-pale-sky-500/10 border-pale-sky-500 ring-2 ring-pale-sky-500/30'
                              : 'bg-canvas border-subtle hover:border-pale-sky-500/50'
                          }`}
                        >
                          {/* Candidate Cover */}
                          <div className="w-14 h-20 rounded-xl bg-surface border border-subtle overflow-hidden flex items-center justify-center shrink-0 shadow-inner">
                            {edition?.coverUrl ? (
                              <img
                                src={formatCoverUrl(edition.coverUrl)}
                                alt={cand.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <BookOpen className="w-6 h-6 text-muted opacity-30" />
                            )}
                          </div>

                          {/* Candidate Meta */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <h5 className="font-bold text-xs sm:text-sm text-main truncate">{cand.title}</h5>
                              {evalItem && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] shrink-0">
                                  {evalItem.matchType === 'exact'
                                    ? t('candidateMatchExact')
                                    : evalItem.matchType === 'high'
                                    ? t('candidateMatchHigh')
                                    : t('candidateMatchAlternative')}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-muted font-serif truncate">
                              {cand.authors?.join(', ') || 'Unknown Author'}
                            </p>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted pt-1">
                              {cand.firstPublishYear && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-amber-500" />
                                  <span>{cand.firstPublishYear}</span>
                                </span>
                              )}
                              {edition?.publisher && (
                                <span className="flex items-center gap-1 truncate max-w-[150px]">
                                  <Building className="w-3 h-3 text-muted" />
                                  <span className="truncate">{edition.publisher}</span>
                                </span>
                              )}
                              {edition?.isbn13 && (
                                <span className="font-mono text-[10px]">{edition.isbn13}</span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center">
                            <div
                              className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-pale-sky-500 border-pale-sky-500 text-white'
                                  : 'border-subtle'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
