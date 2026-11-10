'use client';
import { ReadingLogPanel } from '../notes/ReadingLogPanel';
import { errorMessage } from '../../../shared/errors';


import React, { useState, useRef, useMemo } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  X,
  BookOpen,
  FileText,
  Newspaper,
  Presentation,
  Layers,
  GraduationCap,
  Scroll,
  Headphones,
  Video,
  MapPin,
  Tag,
  Sparkles,
  Check,
  Trash2,
  Plus,
  FolderOpen,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  Calendar,
  DollarSign,
  UserCheck,
  Users,
  ShieldCheck,
  Clock,
  Compass,
  Image as ImageIcon,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Globe,
  Sliders,
  HardDrive,
  AlertTriangle,
  Terminal
} from 'lucide-react';
import {
  BookItem,
  LendingRecord,
  WorkTypeKey,
  WORK_TYPES,
  getWorkTypeInfo,
  Contributor,
  ContributorRole
} from '../../types/library';
import {
  validateWorkMetadata,
  isValidIsbn,
  isValidDoi,
  isValidIssn,
  isPlaceholderAuthor as isSharedPlaceholderAuthor,
  isPlaceholderTitle as isSharedPlaceholderTitle
} from '../../../shared/validators/metadata-validator';
import { useWorkspace } from '../context/WorkspaceContext';
import { useMetadataLookup } from '../../hooks/useMetadataLookup';
import { MetadataDiffModal } from './MetadataDiffModal';
import { MetadataCandidatesModal } from './MetadataCandidatesModal';
import { ProviderSettingsModal } from './ProviderSettingsModal';
import { OnlineLibraryHub } from './OnlineLibraryHub';
import { ReturnBookModal } from './ReturnBookModal';
import { BibliographicWork } from '../../../shared/types/bibliographic';
import { renderPdfPage, renderPdfCoverChoices, type RenderPdfPageResult } from '../../utils/pdf-page-renderer';
import { PdfCoverChoices } from './PdfCoverChoices';
import { resolveDroppedFilePath, formatCoverUrl } from '../../utils/file-path-helper';
import { CategoryCascader } from '../categories/CategoryCascader';
import { TagEditor } from '../tags/TagEditor';
import { EditionComparisonModal } from './EditionComparisonModal';
import { GeekMetadataModal } from './GeekMetadataModal';
import { EditionInput } from './EditionInput';
import { BookVolumesPanel } from './BookVolumesPanel';
import { bookVolumeIssue } from '../../../shared/book-volumes';


interface BookDetailModalProps {
  book: BookItem | null;
  isOpen: boolean;
  initialTab?: 'info' | 'physical' | 'classification' | 'lending';
  isNew?: boolean;
  allCategories?: { id: string; nameAr: string; nameEn: string }[];
  onClose: () => void;
  onSave: (updatedBook: BookItem) => void;
  onDelete: (id: string) => void;
  onOpenVolume?: (book: BookItem, create: boolean) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isOpen,
  isNew,
  initialTab = 'info',
  allCategories = [],
  onClose,
  onSave,
  onDelete,
  onOpenVolume,
}) => {
  const { lang, dir, t, books, refreshBooks } = useWorkspace();

  const isCreateMode = isNew ?? (book ? !books.some((b) => b.id === book.id) : true);

  const [formData, setFormData] = useState<BookItem>(book || ({} as BookItem));
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const [showConfirmDiscard, setShowConfirmDiscard] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'info' | 'physical' | 'classification' | 'lending'>('info');
  const lookupHook = useMetadataLookup();
  const [isDiscoveringFile, setIsDiscoveringFile] = useState<boolean>(false);
  const [isExtractingPdfCover, setIsExtractingPdfCover] = useState<boolean>(false);
  const [isExtractingEpubCover, setIsExtractingEpubCover] = useState<boolean>(false);
  const [currentPdfPage, setCurrentPdfPage] = useState<number>(1);
  const [totalPdfPages, setTotalPdfPages] = useState<number>(1);
  const [pdfCoverPages, setPdfCoverPages] = useState<RenderPdfPageResult[]>([]);
  const pdfCoverRequest = useRef(0);
  const [pdfCoverMessage, setPdfCoverMessage] = useState<string | null>(null);
  const [epubCoverMessage, setEpubCoverMessage] = useState<string | null>(null);
  const [showDiffModal, setShowDiffModal] = useState<boolean>(false);
  const [showCandidatesModal, setShowCandidatesModal] = useState<boolean>(false);
  const [showProviderSettingsModal, setShowProviderSettingsModal] = useState<boolean>(false);
  const [selectedCandidateWork, setSelectedCandidateWork] = useState<BibliographicWork | null>(null);
  const [fetchedWork, setFetchedWork] = useState<BibliographicWork | null>(null);
  const [showGeekModal, setShowGeekModal] = useState<boolean>(false);
  const [autoFillSuccess, setAutoFillSuccess] = useState(false);
  const [isOnlineHubOpen, setIsOnlineHubOpen] = useState<boolean>(false);
  const [isFindOnlineModalOpen, setIsFindOnlineModalOpen] = useState<boolean>(false);
  const [isFetchingOnlineCover, setIsFetchingOnlineCover] = useState<boolean>(false);
  const [isFileImported, setIsFileImported] = useState<boolean>(
    Boolean(book?.filePath && book.filePath.trim().length > 0)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRelinking, setIsRelinking] = useState(false);
  const [isModalDragOver, setIsModalDragOver] = useState(false);
  const modalDragCounterRef = useRef(0);

  const isPlaceholderTitle = (val?: string) => {
    if (!val) return true;
    const trimmed = val.trim();
    if (
      trimmed === 'مادة جديدة في المكتبة' ||
      trimmed === 'New Library Material' ||
      trimmed === t('newMaterialDefaultTitle') ||
      trimmed === ''
    ) {
      return true;
    }
    return isSharedPlaceholderTitle(val);
  };

  const isPlaceholderAuthor = (val?: string) => {
    if (!val) return true;
    const trimmed = val.trim();
    if (
      trimmed === 'مؤلف جديد' ||
      trimmed === 'New Author' ||
      trimmed === 'مؤلف مجهول' ||
      trimmed === 'Unknown Author' ||
      trimmed === 'غير معروف' ||
      trimmed === t('noAuthor') ||
      trimmed === ''
    ) {
      return true;
    }
    return isSharedPlaceholderAuthor(val);
  };

  // Contributor form state
  const [newContribName, setNewContribName] = useState('');
  const [newContribRole, setNewContribRole] = useState<ContributorRole>('author');

  // Lending form state
  const [newBorrower, setNewBorrower] = useState('');
  const [newBorrowerContact, setNewBorrowerContact] = useState('');
  const [newBorrowDate, setNewBorrowDate] = useState(new Date().toISOString().split('T')[0]);
  const [newReturnDate, setNewReturnDate] = useState('');
  const [newLendingNotes, setNewLendingNotes] = useState('');
  const [newLendingConditionOut, setNewLendingConditionOut] = useState('good');
  const [selectedLoanForReturn, setSelectedLoanForReturn] = useState<LendingRecord | null>(null);

  // Physical locations & borrowers suggestions state
  const [existingLocations, setExistingLocations] = useState<{
    rooms: string[];
    bookcases: string[];
    shelves: string[];
    shelfSections: string[];
  }>({ rooms: [], bookcases: [], shelves: [], shelfSections: [] });
  const [pastBorrowers, setPastBorrowers] = useState<import('../../../shared/types/physical-library').BorrowerSummary[]>([]);

  React.useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      if (window.electronAPI?.physical?.getLocations) {
        window.electronAPI.physical
          .getLocations()
          .then((res) => {
            if (res) setExistingLocations(res);
          })
          .catch((err) => console.warn('[baglib/physical] Failed to load locations:', err));
      }
      if (window.electronAPI?.lending?.getBorrowers) {
        window.electronAPI.lending
          .getBorrowers()
          .then((res) => {
            if (Array.isArray(res)) setPastBorrowers(res);
          })
          .catch((err) => console.warn('[baglib/lending] Failed to load borrowers:', err));
      }
    }
  }, [isOpen]);

  // Sync state when book changes
  const [previousBookForm, setPreviousBookForm] = useState<readonly unknown[] | null>(null);
  const inputsBookForm = [book, isOpen];
  if (previousBookForm === null || inputsBookForm.some((value, index) => !Object.is(value, previousBookForm[index]))) {
    setPreviousBookForm(inputsBookForm);
    if (book) {
      const initial: BookItem = {
        ...book,
        description: book.description || book.abstract || '',
        authorBio: book.authorBio || '',
        workType: book.workType || 'book',
        workTypeId: book.workTypeId || 'wt-book',
        contributors: book.contributors || [],
        lendingHistory: book.lendingHistory || [],
      };
      setFormData(initial);
      setInitialSnapshot(JSON.stringify(initial));
      setShowConfirmDiscard(false);
      setActiveTab(initialTab);
      setCurrentPdfPage(1);
      setPdfCoverPages([]);
      setIsExtractingPdfCover(false);
      setTotalPdfPages(1);
      setIsFileImported(Boolean(initial.filePath && initial.filePath.trim().length > 0));

    }
  }

  React.useEffect(() => {
    if (book) {
      const initial = book;
      pdfCoverRequest.current++;
      const initialCoverRequest = pdfCoverRequest.current;
      if (!initial.coverImage && initial.filePath && initial.filePath.toLowerCase().endsWith('.pdf')) {
        renderPdfPage(initial.filePath, 1)
          .then((res) => {
            if (initialCoverRequest !== pdfCoverRequest.current) return;
            if (res?.success) {
              if (res.totalPages) setTotalPdfPages(res.totalPages);
              if (!initial.coverImage && res.coverUrl) {
                setFormData((prev) => prev.filePath === initial.filePath && !prev.coverImage ? { ...prev, coverImage: res.coverUrl } : prev);
              }
            }
          })
          .catch(() => {});
      }

      if (initial.filePath && initial.filePath.toLowerCase().endsWith('.epub') && !initial.coverImage) {
        const windowAPI = (window).electronAPI;
        if (windowAPI?.extractEpubCover) {
          windowAPI.extractEpubCover(initial.filePath)
            .then((res) => {
              if (res?.success && res.coverUrl) {
                setFormData((prev) => prev.id === initial.id && prev.filePath === initial.filePath && !prev.coverImage ? { ...prev, coverImage: res.coverUrl } : prev);
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [book, isOpen, initialTab]);

  // Dirty state tracking comparing formData with initial snapshot
  const isDirty = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(formData) !== initialSnapshot;
  }, [formData, initialSnapshot]);

  // Close attempt handler with dirty check
  const handleAttemptClose = () => {
    if (isDirty) {
      setShowConfirmDiscard(true);
    } else {
      onClose();
    }
  };

  const dialogRef = useDialogFocus(isOpen && !!book, handleAttemptClose);
  const discardRef = useDialogFocus(isOpen && !!book && showConfirmDiscard, () => setShowConfirmDiscard(false));

  // Real-time type-aware validation
  const validation = useMemo(() => {
    return validateWorkMetadata(formData);
  }, [formData]);

  const handleInputChange = <K extends keyof BookItem>(field: K, value: BookItem[K]) => {
    if (field === 'filePath') {
      pdfCoverRequest.current++;
      setPdfCoverPages([]);
      setCurrentPdfPage(1);
      setTotalPdfPages(1);
      setIsExtractingPdfCover(false);
    }
    setFormData((prev) => ({ ...prev, [field]: value, ...(field === 'coverImage' ? {
      metadataProvenance: { ...prev.metadataProvenance, fieldSources: { ...prev.metadataProvenance?.fieldSources, coverImage: { source: 'manual_cover_selection', status: 'user_override' as const, value, confidence: 1 } } },
    } : {}) }));
  };

  const handleWorkTypeChange = (key: WorkTypeKey) => {
    const info = WORK_TYPES[key];
    setFormData((prev) => ({
      ...prev,
      workType: key,
      workTypeId: info.id,
    }));
  };

  const applyFileMetadata = async (fullPath: string, fileNameWithExt: string, fileSizeStr?: string) => {
    pdfCoverRequest.current++;
    setPdfCoverPages([]);
    setCurrentPdfPage(1);
    setTotalPdfPages(1);
    const ext = fileNameWithExt.split('.').pop()?.toUpperCase() || 'PDF';
    const fileNameWithoutExt = fileNameWithExt.replace(/\.[^/.]+$/, '');

    setIsDiscoveringFile(true);

    const windowAPI = (window).electronAPI;

    // Validate digital file if validation service is available
    if (windowAPI?.validateDigitalFile) {
      try {
        const valRes = await windowAPI.validateDigitalFile(fullPath);
        if (valRes && !valRes.isValid) {
          setPdfCoverMessage(
            lang === 'ar'
              ? `الملف المحدد غير صالح: ${valRes.error || 'صيغة غير مدعومة'}`
              : `Selected file is invalid: ${valRes.error || 'unsupported format'}`
          );
          setTimeout(() => setPdfCoverMessage(null), 4000);
          setIsDiscoveringFile(false);
          return;
        }
      } catch (vErr) {
        console.warn('[BookDetailModal] validateDigitalFile error:', vErr);
      }
    }

    let discoveredTitle = fileNameWithoutExt;
    let discoveredAuthor = '';
    let discoveredPublisher = '';
    let discoveredYear: string | number = '';
    let discoveredIsbn = '';
    let discoveredCover = '';
    let discoveredEdition = '';
    let discoveredPagesCount: number | undefined;
    let discoveredLanguage = '';
    let discoveredAbstract = '';

    // Phase 1: Extract strictly offline metadata attached to the file (EPUB/PDF embedded or filename)
    const extractor = windowAPI?.extractOfflineMetadata || windowAPI?.discoverMetadata;
    if (extractor) {
      try {
        const discovery = await extractor({
          filePath: fullPath,
          filename: fileNameWithExt,
          offlineOnly: true,
        });
        if (discovery) {
          if (discovery.title) discoveredTitle = discovery.title;
          if (discovery.authors && discovery.authors.length > 0) {
            discoveredAuthor = discovery.authors.join('، ');
          }
          if (discovery.publisher) discoveredPublisher = discovery.publisher;
          if (discovery.publicationYear) discoveredYear = discovery.publicationYear;
          if (discovery.isbn) discoveredIsbn = discovery.isbn;
          if (discovery.coverUrl) discoveredCover = discovery.coverUrl;
          if (discovery.edition) discoveredEdition = discovery.edition;
          if (discovery.pagesCount) discoveredPagesCount = discovery.pagesCount;
          if (discovery.language) discoveredLanguage = discovery.language;
          if (discovery.description) discoveredAbstract = discovery.description;
        }
      } catch (err) {
        console.warn('[BookDetailModal] extractOfflineMetadata failed:', err);
      }
    }

    // Automatically extract page 1 of the imported PDF as cover if not found via discovery
    if (ext === 'PDF') {
      try {
        const pdfPageRes = await renderPdfPage(fullPath, 1);
        if (pdfPageRes?.success && pdfPageRes.coverUrl) {
          discoveredCover = pdfPageRes.coverUrl;
          setCurrentPdfPage(pdfPageRes.currentPage || 1);
          if (pdfPageRes.totalPages) setTotalPdfPages(pdfPageRes.totalPages);
        }
      } catch (pdfErr) {
        console.warn('[BookDetailModal] renderPdfPage error:', pdfErr);
      }
    } else if (ext === 'EPUB' && !discoveredCover) {
      try {
        if (windowAPI?.extractEpubCover) {
          const epubRes = await windowAPI.extractEpubCover(fullPath);
          if (epubRes?.success && epubRes.coverUrl) {
            discoveredCover = epubRes.coverUrl;
          }
        }
      } catch (epubErr) {
        console.warn('[BookDetailModal] extractEpubCover error:', epubErr);
      }
    }

    // Update the form fields with the newly selected file's metadata respecting Non-Destructive Merge Policy
    setFormData((prev) => {
      // 1. Existing Curated Data Wins: Never overwrite existing non-empty curated fields
      const hasCuratedTitle = Boolean(prev.title && prev.title.trim() !== '' && !isPlaceholderTitle(prev.title));
      const finalTitle = hasCuratedTitle ? prev.title : (discoveredTitle || prev.title);

      const hasCuratedAuthor = Boolean(prev.author && prev.author.trim() !== '' && !isPlaceholderAuthor(prev.author));
      const finalAuthor = hasCuratedAuthor
        ? prev.author
        : (discoveredAuthor ||
          (discoveredLanguage?.toLowerCase().startsWith('ar') ||
          discoveredLanguage === 'العربية' ||
          /[\u0600-\u06FF]/.test(finalTitle) ||
          lang === 'ar'
            ? 'غير معروف'
            : 'Unknown Author'));

      const hasCuratedPublisher = Boolean(prev.publisher && prev.publisher.trim() !== '');
      const finalPublisher = hasCuratedPublisher ? prev.publisher : (discoveredPublisher || prev.publisher);

      const hasCuratedYear = Boolean(
        prev.publicationYear && String(prev.publicationYear).trim() !== '' && Number(prev.publicationYear) > 0
      );
      const finalYear = hasCuratedYear ? prev.publicationYear : (discoveredYear || prev.publicationYear);

      const hasCuratedIsbn = Boolean(prev.isbn && prev.isbn.trim() !== '');
      const finalIsbn = hasCuratedIsbn ? prev.isbn : (discoveredIsbn || prev.isbn);

      const hasCuratedCover = Boolean(prev.coverImage && prev.coverImage.trim() !== '');
      const finalCover = hasCuratedCover ? prev.coverImage : (discoveredCover || prev.coverImage);

      const hasCuratedEdition = Boolean(prev.edition && prev.edition.trim() !== '');
      const finalEdition = hasCuratedEdition ? prev.edition : (discoveredEdition || prev.edition);

      const hasCuratedLanguage = Boolean(prev.language && prev.language.trim() !== '');
      const finalLanguage = hasCuratedLanguage ? prev.language : (discoveredLanguage || prev.language);

      const hasCuratedDescription = Boolean(
        (prev.description && prev.description.trim() !== '') || (prev.abstract && prev.abstract.trim() !== '')
      );
      const finalDescription = hasCuratedDescription
        ? (prev.description || prev.abstract)
        : (discoveredAbstract || prev.description);
      const finalAbstract = hasCuratedDescription
        ? (prev.abstract || prev.description)
        : (discoveredAbstract || prev.abstract);

      return {
        ...prev,
        // Always extract and save technical file properties that belong strictly to the file
        filePath: fullPath,
        digitalFormat: ext as BookItem['digitalFormat'],
        fileSize: fileSizeStr || prev.fileSize || '1.5 MB',
        pagesCount: discoveredPagesCount !== undefined ? discoveredPagesCount : prev.pagesCount,
        bookType: prev.bookType === 'physical' ? 'hybrid' : 'digital',
        storageState: 'available',

        // Merged fields: curated existing metadata wins, file metadata fills gaps only
        title: finalTitle,
        author: finalAuthor,
        publisher: finalPublisher,
        publicationYear: finalYear,
        isbn: finalIsbn,
        coverImage: finalCover,
        edition: finalEdition,
        language: finalLanguage,
        description: finalDescription,
        abstract: finalAbstract,
      };
    });

    setIsDiscoveringFile(false);
    setIsFileImported(true);
    setPdfCoverMessage(
      t('metadataUpdatedFromNewFile') ||
        (lang === 'ar'
          ? 'تم تحديث بيانات الكتاب والغلاف بناءً على الملف الجديد بنجاح!'
          : 'Metadata and cover updated from the new file successfully!')
    );
    setTimeout(() => setPdfCoverMessage(null), 3500);
  };

  const handlePickFileNative = async () => {
    const windowAPI = (window).electronAPI;
    if (windowAPI?.openFileDialog) {
      const fullPath: string | null = await windowAPI.openFileDialog();
      if (!fullPath) return;

      const pathSegments = fullPath.split(/[/\\]/);
      const fileNameWithExt = pathSegments[pathSegments.length - 1];
      await applyFileMetadata(fullPath, fileNameWithExt);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleLocateAndRelink = async () => {
    const windowAPI = (window).electronAPI;
    if (windowAPI?.openFileDialog) {
      const fullPath: string | null = await windowAPI.openFileDialog();
      if (!fullPath) return;

      setIsRelinking(true);
      try {
        if (windowAPI.storage?.relinkFile && formData.id) {
          const res = await windowAPI.storage.relinkFile(formData.id, fullPath);
          if (res && res.success) {
            const formattedSize = res.fileSize
              ? `${(res.fileSize / (1024 * 1024)).toFixed(1)} MB`
              : formData.fileSize;
            setFormData((prev) => ({
              ...prev,
              filePath: fullPath,
              storageState: 'available',
              fileSize: formattedSize,
            }));
            setPdfCoverMessage(t('storageLocateSuccess'));
            setTimeout(() => setPdfCoverMessage(null), 3500);
          } else {
            setPdfCoverMessage(t('storageLocateError', { error: res?.error || 'Unknown error' }));
            setTimeout(() => setPdfCoverMessage(null), 4000);
          }
        } else {
          setFormData((prev) => ({ ...prev, filePath: fullPath, storageState: 'available' }));
          setPdfCoverMessage(t('storageLocateSuccess'));
          setTimeout(() => setPdfCoverMessage(null), 3500);
        }
      } catch (err: unknown) {
        setPdfCoverMessage(t('storageLocateError', { error: errorMessage(err) || 'Error' }));
        setTimeout(() => setPdfCoverMessage(null), 4000);
      } finally {
        setIsRelinking(false);
      }
    }
  };

  const handleModalDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    modalDragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsModalDragOver(true);
    }
  };

  const handleModalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    modalDragCounterRef.current -= 1;
    if (modalDragCounterRef.current <= 0) {
      modalDragCounterRef.current = 0;
      setIsModalDragOver(false);
    }
  };

  const handleModalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleModalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    modalDragCounterRef.current = 0;
    setIsModalDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const fullPath = await resolveDroppedFilePath(file);
    const sizeStr = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    await applyFileMetadata(fullPath, file.name, sizeStr);
  };

  const handleRemoveFile = () => {
    setFormData((prev) => ({
      ...prev,
      filePath: undefined,
      digitalFormat: undefined,
      fileSize: undefined,
      bookType: prev.bookType === 'hybrid' ? 'physical' : prev.bookType,
    }));
    setIsFileImported(false);
  };

  const handleImportFromOnlineHub = (imported: Partial<BookItem>) => {
    setFormData((prev) => ({
      ...prev,
      title: imported.title || prev.title,
      author: imported.author || prev.author,
      authorBio: imported.authorBio || prev.authorBio,
      publisher: imported.publisher || prev.publisher,
      publicationYear: imported.publicationYear || prev.publicationYear,
      isbn: imported.isbn || prev.isbn,
      coverImage: imported.coverImage || prev.coverImage,
      digitalFormat: imported.digitalFormat || prev.digitalFormat,
      filePath: imported.filePath || prev.filePath,
      fileSize: imported.fileSize || prev.fileSize,
      language: imported.language || prev.language,
      description: imported.description || prev.description,
      abstract: imported.description || imported.abstract || prev.abstract,
      onlineSource: (imported.onlineSource) || prev.onlineSource,
      bookType: imported.filePath ? (prev.bookType === 'physical' ? 'hybrid' : 'digital') : prev.bookType,
      categories: imported.categories ? Array.from(new Set([...(prev.categories || []), ...imported.categories])) : prev.categories,
      tags: imported.tags ? Array.from(new Set([...(prev.tags || []), ...imported.tags])) : prev.tags,
    }));

    if (imported.filePath && imported.filePath.trim().length > 0) {
      setIsFileImported(true);
    }
    setIsOnlineHubOpen(false);
    setAutoFillSuccess(true);
    setTimeout(() => setAutoFillSuccess(false), 3000);
  };

  const handleExtractPdfCover = async (page: number = 1) => {
    if (!formData.filePath) return;
    const request = ++pdfCoverRequest.current;

    setIsExtractingPdfCover(true);
    setPdfCoverMessage(null);
    try {
      const pages = await renderPdfCoverChoices(formData.filePath);
      if (request !== pdfCoverRequest.current) return;
      setPdfCoverPages(pages);
      const res = pages.find(candidate => candidate.currentPage === page) || pages[0];
      if (res?.success && res.coverUrl) {
        handleInputChange('coverImage', res.coverUrl);
        setCurrentPdfPage(res.currentPage || page);
        if (res.totalPages) setTotalPdfPages(res.totalPages);
        setPdfCoverMessage(
          page === 1
            ? t('pdfCoverPageSelected', { page: 1 })
            : t('pdfCoverPageSelected', { page: res.currentPage || page })
        );
        setTimeout(() => setPdfCoverMessage(null), 3500);
      } else {
        setPdfCoverMessage(t('pdfCoverRenderFailed'));
        setTimeout(() => setPdfCoverMessage(null), 3500);
      }
    } catch (err) {
      console.warn('[BookDetailModal] renderPdfPage error:', err);
      if (request !== pdfCoverRequest.current) return;
      setPdfCoverMessage(t('pdfCoverRenderFailed'));
      setTimeout(() => setPdfCoverMessage(null), 3500);
    } finally {
      if (request === pdfCoverRequest.current) setIsExtractingPdfCover(false);
    }
  };

  const handleExtractEpubCover = async () => {
    if (!formData.filePath) return;

    setIsExtractingEpubCover(true);
    setEpubCoverMessage(null);
    try {
      const windowAPI = (window).electronAPI;
      if (windowAPI?.extractEpubCover) {
        const res = await windowAPI.extractEpubCover(formData.filePath);
        if (res?.success && res.coverUrl) {
          handleInputChange('coverImage', res.coverUrl);
          setEpubCoverMessage(
            t('epubCoverExtracted') ||
              (lang === 'ar'
                ? 'تم استخراج الغلاف من ملف EPUB وتعيينه كغلاف بنجاح!'
                : 'Cover extracted from EPUB file and set as book cover successfully!')
          );
          setTimeout(() => setEpubCoverMessage(null), 3500);
        } else {
          setEpubCoverMessage(
            t('noEpubImagesFound') ||
              (lang === 'ar'
                ? 'تعذر العثور على صورة غلاف داخل ملف EPUB.'
                : 'No cover image found inside EPUB file.')
          );
          setTimeout(() => setEpubCoverMessage(null), 3500);
        }
      }
    } catch (err) {
      console.warn('[BookDetailModal] extractEpubCover error:', err);
      setEpubCoverMessage(
        lang === 'ar' ? 'تعذر استخراج الغلاف من ملف EPUB.' : 'Failed to extract cover from EPUB.'
      );
      setTimeout(() => setEpubCoverMessage(null), 3500);
    } finally {
      setIsExtractingEpubCover(false);
    }
  };

  const handleSwitchPdfPage = (targetPage: number) => {
    if (targetPage < 1) return;
    if (totalPdfPages > 0 && targetPage > totalPdfPages) return;
    const page = pdfCoverPages.find(candidate => candidate.currentPage === targetPage);
    if (page?.coverUrl) {
      handleInputChange('coverImage', page.coverUrl);
      setCurrentPdfPage(page.currentPage);
      setPdfCoverMessage(t('pdfCoverPageSelected', { page: page.currentPage }));
    }
  };

  const handleFetchOnlineCover = async () => {
    setIsFetchingOnlineCover(true);
    try {
      const windowAPI = (window).electronAPI;
      if (windowAPI?.enrichment?.fetchAndCacheCover) {
        const res = await windowAPI.enrichment.fetchAndCacheCover({
          workId: formData.id,
          isbn: formData.isbn,
          title: formData.title,
          author: formData.author,
        });
        if (res?.success && res.coverUrl) {
          handleInputChange('coverImage', res.coverUrl);
        }
      }
    } catch (err) {
      console.warn('[BookDetailModal] fetch cover failed:', err);
    } finally {
      setIsFetchingOnlineCover(false);
    }
  };

  const handleEnrichmentApplied = (updatedBook: BookItem) => {
    setFormData((prev) => ({
      ...prev,
      ...updatedBook,
    }));
    if (onSave) {
      onSave(updatedBook);
    }
  };

  const handleFileChangeFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const filePath = await resolveDroppedFilePath(file);
    const sizeStr = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    await applyFileMetadata(filePath, file.name, sizeStr);
  };

  // Contributor Management
  const handleAddContributor = () => {
    if (!newContribName.trim()) return;
    const newContrib: Contributor = {
      name: newContribName.trim(),
      role: newContribRole,
    };
    setFormData((prev) => ({
      ...prev,
      contributors: [...(prev.contributors || []), newContrib],
    }));
    setNewContribName('');
  };

  const handleRemoveContributor = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      contributors: (prev.contributors || []).filter((_, i) => i !== index),
    }));
  };

  // Lending Management
  const handleAddLending = async () => {
    if (!newBorrower.trim()) return;

    if (formData.id && typeof window !== 'undefined' && window.electronAPI?.lending?.borrowBook) {
      try {
        await window.electronAPI.lending.borrowBook({
          workId: formData.id,
          borrowerName: newBorrower.trim(),
          borrowerContact: newBorrowerContact.trim() || undefined,
          borrowDate: newBorrowDate || undefined,
          expectedReturnDate: newReturnDate || undefined,
          conditionOut: newLendingConditionOut || (formData.condition ? String(formData.condition) : undefined),
          notes: newLendingNotes.trim() || undefined,
        });

        if (window.electronAPI.lending.getHistory) {
          const updated = await window.electronAPI.lending.getHistory(formData.id);
          setFormData((prev) => ({ ...prev, lendingHistory: updated }));
        }
        await refreshBooks();
      } catch (err: unknown) {
        console.error('[baglib/lending] Failed to record loan via IPC:', err);
      }
    } else {
      const newRecord: LendingRecord = {
        id: `lend-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        borrowerName: newBorrower.trim(),
        borrowerContact: newBorrowerContact.trim() || undefined,
        borrowDate: newBorrowDate,
        expectedReturnDate: newReturnDate || 'غير محدد',
        isReturned: false,
        notes: newLendingNotes.trim() || undefined,
      };
      setFormData((prev) => ({
        ...prev,
        lendingHistory: [newRecord, ...(prev.lendingHistory || [])],
      }));
    }

    setNewBorrower('');
    setNewBorrowerContact('');
    setNewLendingNotes('');
  };

  const handleReturnSuccess = async () => {
    if (formData.id && typeof window !== 'undefined' && window.electronAPI?.lending?.getHistory) {
      try {
        const updated = await window.electronAPI.lending.getHistory(formData.id);
        setFormData((prev) => ({ ...prev, lendingHistory: updated }));
      } catch (err) {
        console.warn('[baglib/lending] Failed to refresh history after return:', err);
      }
    }
    await refreshBooks();
  };

  const handleToggleReturn = (rec: LendingRecord) => {
    if (!rec.isReturned) {
      setSelectedLoanForReturn(rec);
    } else {
      // Toggle back in memory if needed
      setFormData((prev) => ({
        ...prev,
        lendingHistory: (prev.lendingHistory || []).map((r) =>
          r.id === rec.id
            ? {
                ...r,
                isReturned: false,
                actualReturnDate: undefined,
                conditionOnReturn: undefined,
              }
            : r
        ),
      }));
    }
  };

  // Bibliographic Online Metadata Lookup & Diff Preview (Story 5)
  const handleTriggerAutoFill = async (overrideIsbn?: string) => {
    const cleanIsbn = (overrideIsbn || formData.isbn || '').replace(/[-\s]/g, '').trim();
    const rawTitle = formData.title?.trim() || '';
    const title = isPlaceholderTitle(rawTitle) ? '' : rawTitle;
    const rawAuthor = formData.author?.trim() || '';
    const author = isPlaceholderAuthor(rawAuthor) ? '' : rawAuthor;

    if (!cleanIsbn && !title && !formData.filePath) {
      alert(
        lang === 'ar'
          ? 'يرجى إدخال عنوان العمل أو الرقم المعياري (ISBN) أو اختيار ملف للبحث.'
          : 'Please enter a work title, ISBN, or select a file first.'
      );
      return;
    }

    const res = await lookupHook.lookupWithCandidates({
      isbn: cleanIsbn || undefined,
      title: title || undefined,
      author: author || undefined,
      filePath: formData.filePath || undefined,
    });

    if (res && res.candidates && res.candidates.length > 0) {
      const topMatch = res.match || res.candidates[0];
      setSelectedCandidateWork(topMatch);

      if (res.candidates.length > 1) {
        // Multiple candidates found: show selectable candidate modal
        setShowCandidatesModal(true);
      } else {
        // Single candidate found: proceed directly to review diff
        setFetchedWork(topMatch);
        setShowDiffModal(true);
      }
    } else {
      alert(
        lang === 'ar'
          ? t('candidateNoResults')
          : t('candidateNoResults')
      );
    }
  };

  const handleProceedFromCandidates = (work: BibliographicWork) => {
    setSelectedCandidateWork(work);
    setFetchedWork(work);
    setShowCandidatesModal(false);
    setShowDiffModal(true);
  };

  const handleBackToCandidatesFromDiff = () => {
    setShowDiffModal(false);
    setShowCandidatesModal(true);
  };

  const handleApplyDiffUpdates = (updates: Partial<BookItem>) => {
    setFormData((prev) => ({
      ...prev,
      ...updates,
      description: updates.description !== undefined ? updates.description : (updates.abstract !== undefined ? updates.abstract : prev.description),
      abstract: updates.description !== undefined ? updates.description : (updates.abstract !== undefined ? updates.abstract : prev.abstract),
      authorBio: updates.authorBio !== undefined ? updates.authorBio : prev.authorBio,
    }));
    setAutoFillSuccess(true);
    setTimeout(() => setAutoFillSuccess(false), 3000);
  };

  if (!isOpen || !book) return null;

  const currentTypeInfo = getWorkTypeInfo(formData.workType || formData.workTypeId);

  const roleLabelMap: Record<ContributorRole, { ar: string; en: string }> = {
    author: { ar: 'مؤلف', en: 'Author' },
    co_author: { ar: 'مؤلف مشارك', en: 'Co-Author' },
    translator: { ar: 'مترجم', en: 'Translator' },
    editor: { ar: 'محقق / محرر', en: 'Editor' },
    speaker: { ar: 'محاضر / متحدث', en: 'Speaker' },
    narrator: { ar: 'راوٍ / قارئ', en: 'Narrator' },
    commentator: { ar: 'شارح / معلق', en: 'Commentator' },
    advisor: { ar: 'مشرف علمي', en: 'Advisor' },
    scribe: { ar: 'ناسخ', en: 'Scribe' },
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleAttemptClose();
        }
      }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChangeFallback}
        accept=".pdf,.epub,.mobi,.azw3,.txt,.html,.djvu,.docx"
        className="hidden"
      />

      <div
        onDragEnter={handleModalDragEnter}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={isCreateMode ? t('addMaterialTitle') : (book.title || t('editMaterialTitle'))}
        tabIndex={-1}
        onDragLeave={handleModalDragLeave}
        onDragOver={handleModalDragOver}
        onDrop={handleModalDrop}
        className="relative w-full max-w-4xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[92dvh] font-sans"
        dir={dir}
      >
        {/* Drag & Drop File Update Overlay */}
        {isModalDragOver && (
          <div className="absolute inset-0 z-50 bg-canvas/90 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center p-8 border-2 border-dashed border-pale-sky-500 animate-in fade-in duration-200 pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-pale-sky-500/15 border border-pale-sky-500/30 flex items-center justify-center mb-3 text-pale-sky-500 shadow-lg">
              <FolderOpen className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-lg font-bold font-display text-main mb-1 text-center">
              {lang === 'ar' ? 'أفلت الملف هنا لتحديث بيانات وغلاف الكتاب' : 'Drop file here to update book metadata & cover'}
            </h3>
            <p className="text-xs text-muted text-center max-w-sm">
              {t('dropBookSubtitle')}
            </p>
          </div>
        )}
        {/* Unsaved Changes Confirmation Dialog Overlay */}
        {showConfirmDiscard && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div ref={discardRef} role="dialog" aria-modal="true" aria-label={t('unsavedChangesTitle')} tabIndex={-1} className="bg-surface border border-subtle rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-main text-sm sm:text-base">
                    {t('unsavedChangesTitle')}
                  </h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    {t('unsavedChangesPrompt')}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
                <button
                  type="button"
                  onClick={() => setShowConfirmDiscard(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-subtle text-muted hover:text-main hover:bg-canvas text-xs font-semibold transition-all cursor-pointer"
                >
                  {t('keepEditing')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowConfirmDiscard(false);
                    onClose();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-red-500 text-white hover:bg-red-600 text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  {t('discardAndClose')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL HEADER: Title, Type Indicator & Action Buttons              */}
        {/* ================================================================= */}
        <div className="p-3 sm:p-5 bg-canvas/90 border-b border-subtle flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-pale-sky-500/15 border border-pale-sky-500/30 flex items-center justify-center text-pale-sky-500 shrink-0 shadow-sm">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="font-bold text-main text-base sm:text-lg leading-relaxed break-words">
                  {isCreateMode ? t('addMaterialTitle') : (formData.title || t('editMaterialTitle'))}
                </h3>
                {isDirty && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold shrink-0">
                    {t('materialUnsavedChanges')}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted truncate mt-0.5">
                {isCreateMode
                  ? `${formData.title || t('newMaterialDefaultTitle')} • ${currentTypeInfo[lang === 'ar' ? 'nameAr' : 'nameEn']}`
                  : `${formData.author || currentTypeInfo.nameAr} • ${currentTypeInfo[lang === 'ar' ? 'nameAr' : 'nameEn']}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isCreateMode && (
              <button
                type="button"
                onClick={() => setIsFindOnlineModalOpen(true)}
                title={t('findOnlineDesc')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all cursor-pointer shadow-sm"
              >
                <Compass className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('findOnline')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsOnlineHubOpen(true)}
              title={t('openLibraryHubTooltip') || (lang === 'ar' ? 'البحث والاستيراد من المكتبات المفتوحة وخلاصات RSS' : 'Search and import from open libraries and RSS feeds')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/30 text-pale-sky-600 dark:text-pale-sky-300 text-xs font-bold hover:bg-pale-sky-500/20 transition-all cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {t('openLibraryHubBtn') || (lang === 'ar' ? 'المكتبات المفتوحة & RSS' : 'Open Library & RSS')}
              </span>
            </button>

            <button
              onClick={handleAttemptClose}
              className="p-1.5 rounded-xl hover:bg-canvas text-muted hover:text-main transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Searching Status Banner */}
        {lookupHook.status === 'searching' && (
          <div className="bg-pale-sky-500/10 border-b border-pale-sky-500/20 px-4 py-2.5 text-xs text-pale-sky-600 dark:text-pale-sky-400 font-semibold flex items-center justify-between gap-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>{t('lookupSearching')}</span>
            </div>
            <button
              type="button"
              onClick={lookupHook.cancel}
              className="text-xs text-muted hover:text-main underline cursor-pointer"
            >
              {t('cancel')}
            </button>
          </div>
        )}

        {/* No Results Status Banner */}
        {lookupHook.status === 'no_results' && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center justify-between gap-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{t('lookupNotFound')}</span>
            </div>
            <button
              type="button"
              onClick={lookupHook.reset}
              className="p-1 hover:bg-amber-500/20 rounded cursor-pointer text-amber-600 dark:text-amber-400"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Network Error Status Banner */}
        {lookupHook.status === 'error' && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2.5 text-xs text-red-600 dark:text-red-400 font-semibold flex items-center justify-between gap-2 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{t('lookupError')}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={lookupHook.retry}
                className="px-2.5 py-1 rounded bg-red-500/20 text-red-600 dark:text-red-300 font-bold hover:bg-red-500/30 text-xs cursor-pointer"
              >
                {t('lookupRetry')}
              </button>
              <button
                type="button"
                onClick={lookupHook.reset}
                className="p-1 hover:bg-red-500/20 rounded cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Success Banner */}
        {autoFillSuccess && (
          <div className="bg-evergreen-500/10 border-b border-evergreen-500/20 px-4 py-2 text-xs text-evergreen-600 dark:text-evergreen-400 font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{t('metadataAutoFillSuccess')}</span>
          </div>
        )}

        {/* Live Validation Alert Banner */}
        {!validation.isValid && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-semibold">
              {lang === 'ar' ? validation.errors[0]?.messageAr : validation.errors[0]?.messageEn}
            </span>
          </div>
        )}

        {/* ================================================================= */}
        {/* WORK TYPE SELECTOR BAR (9 Polymorphic Types)                      */}
        {/* ================================================================= */}
        <div className="px-4 py-2.5 bg-canvas/50 border-b border-subtle overflow-x-auto scrollbar-none flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-muted uppercase tracking-wider shrink-0 me-1">
            {t('workTypeLabel')}
          </span>
          {(Object.keys(WORK_TYPES) as WorkTypeKey[]).map((key) => {
            const info = WORK_TYPES[key];
            const isSelected = formData.workType === key || formData.workTypeId === info.id;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleWorkTypeChange(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-pale-sky-500 text-white shadow-sm ring-1 ring-pale-sky-400'
                    : 'bg-surface hover:bg-canvas text-muted hover:text-main border border-subtle'
                }`}
              >
                {key === 'book' && <BookOpen className="w-3.5 h-3.5" />}
                {key === 'research_paper' && <FileText className="w-3.5 h-3.5" />}
                {key === 'article' && <Newspaper className="w-3.5 h-3.5" />}
                {key === 'lecture' && <Presentation className="w-3.5 h-3.5" />}
                {key === 'periodical' && <Layers className="w-3.5 h-3.5" />}
                {key === 'thesis' && <GraduationCap className="w-3.5 h-3.5" />}
                {key === 'manuscript' && <Scroll className="w-3.5 h-3.5" />}
                {key === 'podcast' && <Headphones className="w-3.5 h-3.5" />}
                {key === 'video' && <Video className="w-3.5 h-3.5" />}
                <span>{lang === 'ar' ? info.nameAr : info.nameEn}</span>
              </button>
            );
          })}
        </div>

        {/* ================================================================= */}
        {/* NAVIGATION TABS: Info, Physical Location, Classification, Lending */}
        {/* ================================================================= */}
        <div className="flex items-center gap-1 sm:gap-3 px-4 pt-3 bg-canvas/30 border-b border-subtle text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-2.5 px-3 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'info'
                ? 'border-pale-sky-500 text-pale-sky-500 font-bold'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            {lang === 'ar' ? 'البيانات الأساسية والتخصصية' : 'Primary & Type Details'}
          </button>
          <button
            onClick={() => setActiveTab('physical')}
            className={`pb-2.5 px-3 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'physical'
                ? 'border-pale-sky-500 text-pale-sky-500 font-bold'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            {lang === 'ar' ? 'الموقع الفيزيائي والاقتناء' : 'Location & Holdings'}
          </button>
          <button
            onClick={() => setActiveTab('classification')}
            className={`pb-2.5 px-3 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'classification'
                ? 'border-pale-sky-500 text-pale-sky-500 font-bold'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            {lang === 'ar' ? 'المساهمون والتصنيف' : 'Contributors & Tags'}
          </button>
          <button
            onClick={() => setActiveTab('lending')}
            className={`pb-2.5 px-3 border-b-2 transition-all cursor-pointer shrink-0 ${
              activeTab === 'lending'
                ? 'border-pale-sky-500 text-pale-sky-500 font-bold'
                : 'border-transparent text-muted hover:text-main'
            }`}
          >
            {lang === 'ar'
              ? `سجل الإعارة (${(formData.lendingHistory || []).length})`
              : `Lending (${(formData.lendingHistory || []).length})`}
          </button>
        </div>

        {/* ================================================================= */}
        {/* MODAL BODY                                                        */}
        {/* ================================================================= */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4 text-xs">
          {!isCreateMode && book?.id && <ReadingLogPanel workId={book.id}/>}
          {/* TAB 1: INFO & TYPE-SPECIFIC FIELDS */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Linked File Card */}
              <div className="p-3.5 rounded-2xl bg-canvas border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <FileCheck className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 sm:mt-0" />
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-main block truncate">
                        {formData.filePath
                          ? (lang === 'ar' ? 'الملف الرقمي المربوط بالجهاز' : 'Linked Digital File')
                          : (lang === 'ar' ? 'لم يتم ربط ملف رقمي' : 'No Digital File Linked')}
                      </span>

                      {/* Storage Health Badge */}
                      {formData.filePath && (
                        formData.storageState === 'missing' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                            <AlertTriangle className="w-2.5 h-2.5 text-red-500" />
                            <span>{t('storageHealthMissingBadge')}</span>
                          </span>
                        ) : formData.storageState === 'unmounted' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <HardDrive className="w-2.5 h-2.5 text-amber-500" />
                            <span>{t('storageHealthUnmountedBadge')}</span>
                          </span>
                        ) : formData.storageState === 'corrupted' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                            <AlertTriangle className="w-2.5 h-2.5 text-red-500" />
                            <span>{t('storageHealthCorruptedBadge')}</span>
                          </span>
                        ) : formData.storageState === 'duplicate' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            <Layers className="w-2.5 h-2.5 text-purple-500" />
                            <span>{t('storageHealthDuplicateBadge')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                            <span>{t('storageHealthHealthyBadge')}</span>
                          </span>
                        )
                      )}

                      {formData.fileSize && (
                        <span className="text-[10px] text-muted font-mono bg-surface px-1.5 py-0.5 rounded border border-subtle">
                          {formData.fileSize}
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-muted font-mono truncate max-w-md block">
                      {formData.filePath || (lang === 'ar' ? 'اختر ملف من الجهاز لربطه بهذا العمل' : 'Select local PDF/EPUB to associate')}
                    </span>

                    {isDiscoveringFile && (
                      <span className="text-[11px] text-pale-sky-500 font-bold flex items-center gap-1.5 mt-1 animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                        <span>
                          {lang === 'ar'
                            ? 'جاري استخراج بيانات الكتاب والبحث عن الغلاف...'
                            : 'Extracting metadata & discovering cover...'}
                        </span>
                      </span>
                    )}

                    {isRelinking && (
                      <span className="text-[11px] text-amber-500 font-bold flex items-center gap-1.5 mt-1 animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin shrink-0" />
                        <span>
                          {lang === 'ar'
                            ? 'جاري فحص المسار الجديد وإعادة الربط...'
                            : 'Validating new path and relinking...'}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Re-link Action Button when file is missing/unmounted/corrupted */}
                  {formData.filePath && (formData.storageState === 'missing' || formData.storageState === 'unmounted' || formData.storageState === 'corrupted') && (
                    <button
                      type="button"
                      onClick={handleLocateAndRelink}
                      disabled={isRelinking || isDiscoveringFile}
                      title={t('storageActionLocate')}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 text-white font-bold flex items-center gap-1.5 hover:bg-amber-600 transition-all cursor-pointer shadow-sm text-xs disabled:opacity-50"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{t('storageActionLocate')}</span>
                    </button>
                  )}

                  {formData.filePath && (
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      disabled={isDiscoveringFile || isRelinking}
                      title={t('removeLinkedFile') || (lang === 'ar' ? 'إزالة الملف المربوط' : 'Remove Linked File')}
                      className="px-2.5 py-1.5 rounded-xl bg-surface border border-subtle hover:bg-red-500/10 hover:border-red-500/30 text-muted hover:text-red-500 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                      <span className="hidden sm:inline">{t('removeLinkedFile') || (lang === 'ar' ? 'إزالة' : 'Remove')}</span>
                    </button>
                  )}

                  <button
                    onClick={handlePickFileNative}
                    disabled={isDiscoveringFile || isRelinking}
                    className="px-3 py-1.5 rounded-xl bg-surface border border-subtle hover:bg-canvas text-main font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-sm disabled:opacity-50"
                  >
                    <FolderOpen className="w-4 h-4 text-amber-500" />
                    <span>{formData.filePath ? (lang === 'ar' ? 'تغيير الملف' : 'Change File') : (lang === 'ar' ? 'اختيار ملف' : 'Select File')}</span>
                  </button>
                </div>
              </div>

              {/* Cover Image Section */}
              <div className="p-3.5 rounded-2xl bg-canvas border border-subtle flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
                <div className="w-16 h-22 rounded-xl bg-surface border border-subtle overflow-hidden shrink-0 flex items-center justify-center relative shadow-sm">
                  {isDiscoveringFile ? (
                    <div className="flex flex-col items-center justify-center text-pale-sky-500 p-1 text-center animate-pulse">
                      <RefreshCw className="w-5 h-5 animate-spin mb-1" />
                      <span className="text-[9px] font-bold">{t('providerStatusRunning')}</span>
                    </div>
                  ) : formData.coverImage ? (
                    <img
                      src={formatCoverUrl(formData.coverImage)}
                      alt={formData.title || 'Cover'}
                      className={`w-full h-full ${formData.filePath?.toLowerCase().endsWith('.pdf') ? 'object-contain bg-white' : 'object-cover'}`}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted p-1 text-center">
                      <BookOpen className="w-6 h-6 opacity-40 mb-1" />
                      <span className="text-[9px] font-medium leading-tight">{t('noCoverImage')}</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-1.5 w-full min-w-0">
                  <label className="font-bold text-main flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-pale-sky-500" />
                    <span>{t('coverImageUrl')}</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={formData.coverImage || ''}
                      onChange={(e) => handleInputChange('coverImage', e.target.value)}
                      placeholder={t('coverImagePlaceholder')}
                      className="flex-1 min-w-[140px] p-2 rounded-xl bg-surface border border-subtle text-main outline-none focus:border-pale-sky-500 text-xs font-mono"
                    />
                    {formData.filePath && formData.filePath.toLowerCase().endsWith('.pdf') && (
                      <button
                        type="button"
                        onClick={() => handleExtractPdfCover(1)}
                        disabled={isExtractingPdfCover || isDiscoveringFile}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-pale-sky-500/30 bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 hover:bg-pale-sky-500/20 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0"
                        title={t('extractPdfCoverBtn')}
                      >
                        {isExtractingPdfCover ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>{isExtractingPdfCover ? t('extractingPdfCover') : t('extractPdfCoverBtn')}</span>
                      </button>
                    )}
                    {formData.filePath && formData.filePath.toLowerCase().endsWith('.epub') && (
                      <button
                        type="button"
                        onClick={handleExtractEpubCover}
                        disabled={isExtractingEpubCover}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-pale-sky-500/30 bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 hover:bg-pale-sky-500/20 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0"
                        title={t('extractEpubCoverBtn')}
                      >
                        {isExtractingEpubCover ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span>{isExtractingEpubCover ? t('extractingEpubCover') : t('extractEpubCoverBtn')}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleFetchOnlineCover}
                      disabled={isFetchingOnlineCover}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
                      title={t('fetchCover')}
                    >
                      {isFetchingOnlineCover ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Compass className="w-3.5 h-3.5" />
                      )}
                      <span>{isFetchingOnlineCover ? t('fetchingCover') : t('fetchCover')}</span>
                    </button>
                    {formData.coverImage && (
                      <button
                        type="button"
                        onClick={() => handleInputChange('coverImage', '')}
                        className="px-2.5 py-2 rounded-xl border border-subtle text-muted hover:text-red-500 hover:bg-canvas text-xs font-bold transition-all cursor-pointer shrink-0"
                      >
                        {lang === 'ar' ? 'إزالة' : 'Clear'}
                      </button>
                    )}
                  </div>

                  {pdfCoverPages.length > 0 && <PdfCoverChoices pages={pdfCoverPages} selected={currentPdfPage} onSelect={page => handleSwitchPdfPage(page.currentPage)} t={t} />}
                  {/* Controls shown under the button (above title field) */}
                  {formData.filePath && formData.filePath.toLowerCase().endsWith('.pdf') && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="text-[11px] font-semibold text-pale-sky-600 dark:text-pale-sky-400 min-h-[16px]">
                        {pdfCoverMessage || ''}
                      </div>

                      {/* Two small arrows to switch next / previous page under the button */}
                      <div className="inline-flex items-center gap-1.5 bg-surface border border-subtle rounded-xl px-2 py-1 shadow-xs shrink-0 ms-auto">
                        <span className="text-[11px] text-muted font-medium">
                          {t('coverPageLabel')}
                        </span>

                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleSwitchPdfPage(currentPdfPage - 1)}
                            disabled={isExtractingPdfCover || !pdfCoverPages.length || currentPdfPage <= 1}
                            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-canvas text-muted hover:text-main disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-transparent hover:border-subtle"
                            title={t('previousCoverPage')}
                          >
                            {dir === 'rtl' ? (
                              <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronLeft className="w-3.5 h-3.5" />
                            )}
                          </button>

                          <span className="text-[11px] font-bold text-main px-1.5 font-mono min-w-[42px] text-center select-none">
                            {totalPdfPages > 1 ? `${currentPdfPage} / ${totalPdfPages}` : `${currentPdfPage}`}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleSwitchPdfPage(currentPdfPage + 1)}
                            disabled={isExtractingPdfCover || !pdfCoverPages.length || currentPdfPage >= totalPdfPages}
                            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-canvas text-muted hover:text-main disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-transparent hover:border-subtle"
                            title={t('nextCoverPage')}
                          >
                            {dir === 'rtl' ? (
                              <ChevronLeft className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.filePath && formData.filePath.toLowerCase().endsWith('.epub') && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="text-[11px] font-semibold text-pale-sky-600 dark:text-pale-sky-400 min-h-[16px]">
                        {epubCoverMessage || ''}
                      </div>
                    </div>
                  )}

                  {!formData.filePath && (pdfCoverMessage || epubCoverMessage) && (
                    <div className="text-[11px] font-semibold text-pale-sky-600 dark:text-pale-sky-400">
                      {pdfCoverMessage || epubCoverMessage}
                    </div>
                  )}
                </div>
              </div>

              {/* Shared Primary Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-main flex items-center gap-1">
                      <span>{lang === 'ar' ? 'العنوان الرئيسي' : 'Title'}</span>
                      <span className="text-red-500">*</span>
                    </label>

                    {/* Contextual Auto-fill Action: Shown strictly when a file has been successfully imported */}
                    {isFileImported && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTriggerAutoFill()}
                          disabled={lookupHook.status === 'searching'}
                          title={t('autoFillTooltip')}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer disabled:opacity-50 animate-in fade-in duration-200"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${lookupHook.status === 'searching' ? 'animate-spin' : ''}`} />
                          <span>
                            {lookupHook.status === 'searching'
                              ? t('autoFillingWeb')
                              : t('autoFillWeb')}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowProviderSettingsModal(true)}
                          title={t('providerSettingsTooltip')}
                          aria-label={t('providerSettingsBtn')}
                          className="p-1.5 rounded-lg bg-canvas border border-subtle text-muted hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/30 transition-all cursor-pointer"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowGeekModal(true)}
                          title={t('geekDetailsBtn')}
                          aria-label={t('geekDetailsBtn')}
                          className="p-1.5 rounded-lg bg-canvas border border-subtle text-muted hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-500/30 transition-all cursor-pointer"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder={lang === 'ar' ? 'أدخل عنوان العمل...' : 'Enter work title...'}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500 text-sm font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">
                    {formData.workType === 'lecture'
                      ? (lang === 'ar' ? 'المحاضر / المتحدث الرئيسي' : 'Speaker')
                      : formData.workType === 'manuscript'
                      ? (lang === 'ar' ? 'المؤلف / المنسوب إليه' : 'Author')
                      : (lang === 'ar' ? 'المؤلف الرئيسي' : 'Primary Author')}
                  </label>
                  <input
                    type="text"
                    value={formData.author || ''}
                    onChange={(e) => handleInputChange('author', e.target.value)}
                    placeholder={lang === 'ar' ? 'اسم المؤلف أو المحاضر...' : 'Author or speaker name...'}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-main">{t('workLanguage')}</label>
                    {formData.language && (
                      <span className="text-[10px] text-pale-sky-500 font-medium px-1.5 py-0.5 rounded bg-pale-sky-500/10 border border-pale-sky-500/20">
                        {t('langAutoDetected')}
                      </span>
                    )}
                  </div>
                  <select
                    value={formData.language || ''}
                    onChange={(e) => handleInputChange('language', e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  >
                    <option value="">{t('langUnspecified')}</option>
                    <option value="العربية">{t('langArabic')}</option>
                    <option value="English">{t('langEnglish')}</option>
                    <option value="الفرنسية">{t('langFrench')}</option>
                    <option value="الفارسية">{t('langPersian')}</option>
                    <option value="التركية">{t('langTurkish')}</option>
                    <option value="الألمانية">{t('langGerman')}</option>
                    <option value="الإسبانية">{t('langSpanish')}</option>
                    <option value="الروسية">{t('langRussian')}</option>
                    <option value="الأردية">{t('langUrdu')}</option>
                    <option value="الإيطالية">{t('langItalian')}</option>
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-main flex items-center gap-1.5 text-xs">
                      <span>{t('authorBio')}</span>
                    </label>
                    {formData.authorBio && (
                      <span className="text-[10px] text-muted font-normal">
                        {formData.authorBio.length} {lang === 'ar' ? 'حرف' : 'chars'}
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    value={formData.authorBio || ''}
                    onChange={(e) => handleInputChange('authorBio', e.target.value)}
                    placeholder={t('authorBioPlaceholder')}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500 text-xs resize-y leading-relaxed font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">{lang === 'ar' ? 'سنة النشر أو الإنتاج' : 'Publication Year'}</label>
                  <input
                    type="number"
                    value={formData.publicationYear || ''}
                    onChange={(e) => handleInputChange('publicationYear', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="2026"
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-main">{lang === 'ar' ? 'نوع الحيازة' : 'Holding Type'}</label>
                  <select
                    value={formData.bookType || 'physical'}
                    onChange={(e) => handleInputChange('bookType', e.target.value as BookItem['bookType'])}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  >
                    <option value="physical">{lang === 'ar' ? 'نسخة ورقية / فيزيائية' : 'Physical Copy'}</option>
                    <option value="digital">{lang === 'ar' ? 'نسخة رقمية (ملف إلكتروني)' : 'Digital File'}</option>
                    <option value="hybrid">{lang === 'ar' ? 'مزدوج (ورقي ورقمي معا)' : 'Hybrid (Both)'}</option>
                  </select>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* DYNAMIC CONTEXT-SENSITIVE TYPE-SPECIFIC CARD                  */}
              {/* ------------------------------------------------------------- */}
              <div className="p-4 rounded-2xl bg-canvas/60 border border-subtle space-y-3 mt-4">
                <div className="flex items-center gap-2 text-pale-sky-600 dark:text-pale-sky-400 font-bold border-b border-subtle pb-2">
                  <Compass className="w-4 h-4" />
                  <span>
                    {lang === 'ar'
                      ? `حقول مخصصة لـ: ${currentTypeInfo.nameAr}`
                      : `Specific Fields for: ${currentTypeInfo.nameEn}`}
                  </span>
                </div>

                {/* 1. BOOK FIELDS */}
                {formData.workType === 'book' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-main">{lang === 'ar' ? 'الرقم المعياري (ISBN):' : 'ISBN:'}</label>
                        <div className="flex items-center gap-2">
                          {formData.isbn && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isValidIsbn(formData.isbn) ? 'bg-evergreen-500/10 text-evergreen-600' : 'bg-red-500/10 text-red-600'}`}>
                              {isValidIsbn(formData.isbn) ? '✓ ISBN صالح' : '✗ غير صالح'}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleTriggerAutoFill(formData.isbn)}
                            disabled={!formData.isbn?.trim() || lookupHook.status === 'searching'}
                            className="text-[10px] font-bold text-pale-sky-600 dark:text-pale-sky-400 hover:underline flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                            title={t('lookupByIsbnBtn')}
                          >
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>{t('lookupByIsbnBtn')}</span>
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={formData.isbn || ''}
                        onChange={(e) => handleInputChange('isbn', e.target.value)}
                        placeholder="978-9953-0-1234-5"
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'دار النشر (Publisher):' : 'Publisher:'}</label>
                      <input
                        type="text"
                        value={formData.publisher || ''}
                        onChange={(e) => handleInputChange('publisher', e.target.value)}
                        placeholder={lang === 'ar' ? 'دار النشر...' : 'Publisher name...'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <EditionInput key={formData.id} book={formData} onChange={value => handleInputChange('edition', value)} t={t} />
                    <BookVolumesPanel book={formData} books={books} t={t} saved={!isCreateMode && !isDirty} onChange={handleInputChange} onOpen={onOpenVolume ? volume => { if (!isDirty || window.confirm(t('bookVolumesDiscardConfirm'))) onOpenVolume(volume, false); } : undefined} onAdd={onOpenVolume ? volume => onOpenVolume(volume, true) : undefined} />
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'عدد الصفحات (Pages):' : 'Pages Count:'}</label>
                      <input
                        type="number"
                        value={formData.pagesCount || ''}
                        onChange={(e) => handleInputChange('pagesCount', e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder="350"
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* 2. RESEARCH PAPER FIELDS */}
                {formData.workType === 'research_paper' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="font-bold text-main">{lang === 'ar' ? 'المعرف الرقمي (DOI):' : 'DOI:'}</label>
                          {formData.doi && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isValidDoi(formData.doi) ? 'bg-evergreen-500/10 text-evergreen-600' : 'bg-red-500/10 text-red-600'}`}>
                              {isValidDoi(formData.doi) ? '✓ DOI صالح' : '✗ غير صالح'}
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={formData.doi || ''}
                          onChange={(e) => handleInputChange('doi', e.target.value)}
                          placeholder="10.1000/182"
                          className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none font-mono text-[11px]"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-main">{lang === 'ar' ? 'اسم المجلة العلمية (Journal):' : 'Journal Name:'}</label>
                        <input
                          type="text"
                          value={formData.journalName || ''}
                          onChange={(e) => handleInputChange('journalName', e.target.value)}
                          placeholder="Journal of Arabic Studies"
                          className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-main">{lang === 'ar' ? 'اسم المؤتمر (Conference):' : 'Conference Name:'}</label>
                        <input
                          type="text"
                          value={formData.conferenceName || ''}
                          onChange={(e) => handleInputChange('conferenceName', e.target.value)}
                          placeholder="ACL 2026"
                          className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-main">{lang === 'ar' ? 'نطاق الصفحات (Pages Range):' : 'Pages Range:'}</label>
                        <input
                          type="text"
                          value={formData.pagesRange || ''}
                          onChange={(e) => handleInputChange('pagesRange', e.target.value)}
                          placeholder="120-145"
                          className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="font-bold text-main">{lang === 'ar' ? 'معرف ArXiv ID:' : 'ArXiv ID:'}</label>
                        <input
                          type="text"
                          value={formData.arxivId || ''}
                          onChange={(e) => handleInputChange('arxivId', e.target.value)}
                          placeholder="2601.12345"
                          className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-6">
                        <input
                          type="checkbox"
                          id="peerReviewedCheck"
                          checked={formData.peerReviewed || false}
                          onChange={(e) => handleInputChange('peerReviewed', e.target.checked)}
                          className="w-4 h-4 accent-pale-sky-500 rounded cursor-pointer"
                        />
                        <label htmlFor="peerReviewedCheck" className="font-bold text-main cursor-pointer">
                          {lang === 'ar' ? 'ورقة علمية محكمة (Peer-Reviewed)' : 'Peer-Reviewed Paper'}
                        </label>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'المستخلص العلمي (Abstract):' : 'Abstract:'}</label>
                      <textarea
                        rows={3}
                        value={formData.abstract || ''}
                        onChange={(e) => handleInputChange('abstract', e.target.value)}
                        placeholder={lang === 'ar' ? 'ملخص البحث...' : 'Abstract of the paper...'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none resize-none leading-relaxed"
                      />
                    </div>
                  </div>
                )}

                {/* 3. LECTURE & TALK FIELDS */}
                {formData.workType === 'lecture' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'المحاضر (Speaker):' : 'Speaker:'}</label>
                      <input
                        type="text"
                        value={formData.speaker || ''}
                        onChange={(e) => handleInputChange('speaker', e.target.value)}
                        placeholder={lang === 'ar' ? 'اسم المتحدث...' : 'Speaker name...'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'المؤسسة المستضيفة (Host Institution):' : 'Host Institution:'}</label>
                      <input
                        type="text"
                        value={formData.hostInstitution || ''}
                        onChange={(e) => handleInputChange('hostInstitution', e.target.value)}
                        placeholder={lang === 'ar' ? 'الجامعة أو المعهد...' : 'Host university / institute...'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'عنوان الدورة أو الحدث:' : 'Course / Event Title:'}</label>
                      <input
                        type="text"
                        value={formData.courseOrEventTitle || ''}
                        onChange={(e) => handleInputChange('courseOrEventTitle', e.target.value)}
                        placeholder={lang === 'ar' ? 'اسم السلسلة أو المؤتمر...' : 'Series / course title...'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'المدة بالدقائق (Duration Minutes):' : 'Duration (Minutes):'}</label>
                      <input
                        type="number"
                        value={formData.durationMinutes || ''}
                        onChange={(e) => handleInputChange('durationMinutes', e.target.value ? parseInt(e.target.value) : undefined)}
                        placeholder="90"
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'رابط التسجيل أو البث (Recording URL):' : 'Recording URL:'}</label>
                      <input
                        type="url"
                        value={formData.recordingUrl || ''}
                        onChange={(e) => handleInputChange('recordingUrl', e.target.value)}
                        placeholder="https://youtube.com/... or https://archive.org/..."
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* 4. PERIODICAL / MAGAZINE FIELDS */}
                {formData.workType === 'periodical' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'اسم الدورية / المجلة:' : 'Periodical Title:'}</label>
                      <input
                        type="text"
                        value={formData.periodicalTitle || ''}
                        onChange={(e) => handleInputChange('periodicalTitle', e.target.value)}
                        placeholder={lang === 'ar' ? 'مجلة مجمع اللغة العربية' : 'Magazine / Journal Title'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-main">{lang === 'ar' ? 'الرقم المعياري للدوريات (ISSN):' : 'ISSN:'}</label>
                        {formData.issn && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isValidIssn(formData.issn) ? 'bg-evergreen-500/10 text-evergreen-600' : 'bg-red-500/10 text-red-600'}`}>
                            {isValidIssn(formData.issn) ? '✓ ISSN صالح' : '✗ غير صالح'}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={formData.issn || ''}
                        onChange={(e) => handleInputChange('issn', e.target.value)}
                        placeholder="2049-3630"
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'رقم العدد (Issue Number):' : 'Issue Number:'}</label>
                      <input
                        type="text"
                        value={formData.issueNumber || ''}
                        onChange={(e) => handleInputChange('issueNumber', e.target.value)}
                        placeholder="120"
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'رقم المجلد (Volume Number):' : 'Volume Number:'}</label>
                      <input
                        type="text"
                        value={formData.volumeNumber || ''}
                        onChange={(e) => handleInputChange('volumeNumber', e.target.value)}
                        placeholder="45"
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'فصل أو شهر الصدور:' : 'Season / Month:'}</label>
                      <input
                        type="text"
                        value={formData.publicationSeasonOrMonth || ''}
                        onChange={(e) => handleInputChange('publicationSeasonOrMonth', e.target.value)}
                        placeholder={lang === 'ar' ? 'ربيع 2024' : 'Spring 2024'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* 5. THESIS FIELDS */}
                {formData.workType === 'thesis' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'الدرجة العلمية:' : 'Degree Level:'}</label>
                      <select
                        value={formData.degreeLevel || 'master'}
                        onChange={(e) => handleInputChange('degreeLevel', e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      >
                        <option value="master">{lang === 'ar' ? 'ماجستير (Master’s)' : 'Master’s'}</option>
                        <option value="phd">{lang === 'ar' ? 'دكتوراه (PhD)' : 'Doctorate / PhD'}</option>
                        <option value="bachelor">{lang === 'ar' ? 'بحث تخرج بكالوريوس' : 'Bachelor’s'}</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'المشرف العلمي (Advisor):' : 'Advisor:'}</label>
                      <input
                        type="text"
                        value={formData.advisor || ''}
                        onChange={(e) => handleInputChange('advisor', e.target.value)}
                        placeholder={lang === 'ar' ? 'أ.د. فاروق السامرائي' : 'Prof. Advisor Name'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'الكلية / القسم:' : 'Faculty / Department:'}</label>
                      <input
                        type="text"
                        value={formData.facultyOrDepartment || ''}
                        onChange={(e) => handleInputChange('facultyOrDepartment', e.target.value)}
                        placeholder={lang === 'ar' ? 'كلية الآداب - قسم التاريخ' : 'Faculty of Arts'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'تاريخ المناقشة الدفاع:' : 'Defense Date:'}</label>
                      <input
                        type="date"
                        value={formData.defenseDate || ''}
                        onChange={(e) => handleInputChange('defenseDate', e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* 6. MANUSCRIPT FIELDS */}
                {formData.workType === 'manuscript' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'جهة الحفظ / الخزانة:' : 'Holding Institution:'}</label>
                      <input
                        type="text"
                        value={formData.holdingInstitution || ''}
                        onChange={(e) => handleInputChange('holdingInstitution', e.target.value)}
                        placeholder={lang === 'ar' ? 'دار الكتب والوثائق القومية' : 'National Library / Archive'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'رقم الحفظ / Codex:' : 'Codex / Shelfmark:'}</label>
                      <input
                        type="text"
                        value={formData.codexOrShelfmark || ''}
                        onChange={(e) => handleInputChange('codexOrShelfmark', e.target.value)}
                        placeholder={lang === 'ar' ? 'مخطوط رقم 458 حديث' : 'MS 458 Hadith'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'اسم الناسخ (Scribe):' : 'Scribe:'}</label>
                      <input
                        type="text"
                        value={formData.scribe || ''}
                        onChange={(e) => handleInputChange('scribe', e.target.value)}
                        placeholder={lang === 'ar' ? 'علي بن الحسين البغدادي' : 'Scribe Name'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'نوع الخط (Script):' : 'Script Type:'}</label>
                      <select
                        value={formData.scriptType || 'نسخ'}
                        onChange={(e) => handleInputChange('scriptType', e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      >
                        <option value="نسخ">{lang === 'ar' ? 'خط النسخ' : 'Naskh'}</option>
                        <option value="ثلث">{lang === 'ar' ? 'خط الثلث' : 'Thuluth'}</option>
                        <option value="كوفي">{lang === 'ar' ? 'الخط الكوفي' : 'Kufic'}</option>
                        <option value="رقعة">{lang === 'ar' ? 'خط الرقعة' : 'Ruq\'ah'}</option>
                        <option value="مغربي">{lang === 'ar' ? 'الخط المغربي' : 'Maghrebi'}</option>
                        <option value="ديواني">{lang === 'ar' ? 'الخط الديواني' : 'Diwani'}</option>
                        <option value="تعليق">{lang === 'ar' ? 'خط التعليق / الفارسي' : 'Nasta\'liq'}</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'عدد الأوراق (Folios):' : 'Folio Count:'}</label>
                      <input
                        type="text"
                        value={formData.folioCount || ''}
                        onChange={(e) => handleInputChange('folioCount', e.target.value)}
                        placeholder="284 ورقة"
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* 7. ARTICLE FIELDS */}
                {formData.workType === 'article' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'اسم الصحيفة / الموقع:' : 'Publication Name:'}</label>
                      <input
                        type="text"
                        value={formData.publicationName || ''}
                        onChange={(e) => handleInputChange('publicationName', e.target.value)}
                        placeholder="Al-Jazeera / The Guardian"
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'تاريخ النشر:' : 'Issue Date:'}</label>
                      <input
                        type="date"
                        value={formData.issueDate || ''}
                        onChange={(e) => handleInputChange('issueDate', e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* BOOK / WORK DESCRIPTION & SYNOPSIS */}
              <div className="p-4 rounded-2xl bg-canvas/60 border border-subtle space-y-2 mt-4">
                <div className="flex items-center justify-between border-b border-subtle pb-2">
                  <label className="font-bold text-main flex items-center gap-2 text-xs text-pale-sky-600 dark:text-pale-sky-400">
                    <FileText className="w-4 h-4" />
                    <span>{t('bookDescription')}</span>
                  </label>
                  {formData.description && (
                    <span className="text-[10px] text-muted font-mono">
                      {formData.description.length} {lang === 'ar' ? 'حرف' : 'chars'}
                    </span>
                  )}
                </div>
                <textarea
                  rows={4}
                  value={formData.description || formData.abstract || ''}
                  onChange={(e) => {
                    handleInputChange('description', e.target.value);
                    handleInputChange('abstract', e.target.value);
                  }}
                  placeholder={t('bookDescriptionPlaceholder')}
                  className="w-full p-3 rounded-xl bg-surface border border-subtle text-main outline-none focus:border-pale-sky-500 text-xs leading-relaxed resize-y font-sans"
                />
              </div>
            </div>
          )}

          {/* TAB 2: PHYSICAL LOCATION & ACQUISITION */}
          {activeTab === 'physical' && (
            <div className="space-y-4">
              {/* Location Breadcrumb / Summary */}
              {[formData.room, formData.bookcase, formData.shelf, formData.shelfSection].some(Boolean) ? (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span className="font-bold">{t('locationBreadcrumb')}</span>
                  <span className="font-mono font-bold">
                    {[formData.room, formData.bookcase, formData.shelf, formData.shelfSection]
                      .filter(Boolean)
                      .join(' › ')}
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-2xl bg-canvas border border-subtle flex items-center gap-2 text-xs text-muted">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>{t('noLocationAssigned')}</span>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-canvas border border-subtle space-y-3">
                <h4 className="font-bold text-main flex items-center gap-1.5 text-xs text-pale-sky-600 dark:text-pale-sky-400">
                  <MapPin className="w-4 h-4" />
                  <span>{t('physicalCopyTitle')}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-main text-xs">{t('locationRoom')}</label>
                    <input
                      type="text"
                      list="room-suggestions"
                      value={formData.room || ''}
                      onChange={(e) => handleInputChange('room', e.target.value)}
                      placeholder={t('locationRoomPlaceholder')}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                    <datalist id="room-suggestions">
                      {existingLocations.rooms.map((r) => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main text-xs">{t('locationBookcase')}</label>
                    <input
                      type="text"
                      list="bookcase-suggestions"
                      value={formData.bookcase || ''}
                      onChange={(e) => handleInputChange('bookcase', e.target.value)}
                      placeholder={t('locationBookcasePlaceholder')}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                    <datalist id="bookcase-suggestions">
                      {existingLocations.bookcases.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main text-xs">{t('locationShelf')}</label>
                    <input
                      type="text"
                      list="shelf-suggestions"
                      value={formData.shelf || ''}
                      onChange={(e) => handleInputChange('shelf', e.target.value)}
                      placeholder={t('locationShelfPlaceholder')}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                    <datalist id="shelf-suggestions">
                      {existingLocations.shelves.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main text-xs">{t('locationShelfSection')}</label>
                    <input
                      type="text"
                      list="shelf-section-suggestions"
                      value={formData.shelfSection || ''}
                      onChange={(e) => handleInputChange('shelfSection', e.target.value)}
                      placeholder={t('locationSectionPlaceholder')}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                    <datalist id="shelf-section-suggestions">
                      {existingLocations.shelfSections.map((sec) => (
                        <option key={sec} value={sec} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-canvas border border-subtle space-y-3">
                <h4 className="font-bold text-main flex items-center gap-1.5 text-xs text-pale-sky-600 dark:text-pale-sky-400">
                  <DollarSign className="w-4 h-4" />
                  <span>{t('acquisitionPrice')}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-main text-xs">{t('physicalCondition')}</label>
                    <select
                      value={formData.condition || 'good'}
                      onChange={(e) => handleInputChange('condition', e.target.value as BookItem['condition'])}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors cursor-pointer"
                    >
                      <option value="mint">{t('conditionMint')}</option>
                      <option value="good">{t('conditionGood')}</option>
                      <option value="fair">{t('conditionFair')}</option>
                      <option value="poor">{t('conditionPoor')}</option>
                      <option value="antique">{t('conditionAntique')}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main text-xs">{t('acquisitionDate')}</label>
                    <input
                      type="date"
                      value={formData.purchaseDate || ''}
                      onChange={(e) => handleInputChange('purchaseDate', e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main text-xs">{t('acquisitionPrice')}</label>
                    <input
                      type="text"
                      value={formData.price || ''}
                      onChange={(e) => handleInputChange('price', e.target.value)}
                      placeholder={t('pricePlaceholder')}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CONTRIBUTORS & CLASSIFICATION */}
          {activeTab === 'classification' && (
            <div className="space-y-4">
              {/* Contributors Breakdown */}
              <div className="p-4 rounded-2xl bg-canvas border border-subtle space-y-3">
                <h4 className="font-bold text-main flex items-center gap-1.5 text-xs text-pale-sky-600 dark:text-pale-sky-400">
                  <Users className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'المساهمون في العمل وأدوارهم' : 'Contributors & Roles'}</span>
                </h4>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    placeholder={lang === 'ar' ? 'اسم المساهم (مؤلف، مترجم، محقق، إلخ)...' : 'Contributor name...'}
                    value={newContribName}
                    onChange={(e) => setNewContribName(e.target.value)}
                    className="flex-1 p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                  />
                  <select
                    value={newContribRole}
                    onChange={(e) => setNewContribRole(e.target.value as ContributorRole)}
                    className="p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                  >
                    <option value="author">{roleLabelMap.author[lang === 'ar' ? 'ar' : 'en']}</option>
                    <option value="co_author">{roleLabelMap.co_author[lang === 'ar' ? 'ar' : 'en']}</option>
                    <option value="translator">{roleLabelMap.translator[lang === 'ar' ? 'ar' : 'en']}</option>
                    <option value="editor">{roleLabelMap.editor[lang === 'ar' ? 'ar' : 'en']}</option>
                    <option value="commentator">{roleLabelMap.commentator[lang === 'ar' ? 'ar' : 'en']}</option>
                    <option value="advisor">{roleLabelMap.advisor[lang === 'ar' ? 'ar' : 'en']}</option>
                    <option value="scribe">{roleLabelMap.scribe[lang === 'ar' ? 'ar' : 'en']}</option>
                    <option value="speaker">{roleLabelMap.speaker[lang === 'ar' ? 'ar' : 'en']}</option>
                    <option value="narrator">{roleLabelMap.narrator[lang === 'ar' ? 'ar' : 'en']}</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddContributor}
                    className="px-4 py-2.5 rounded-xl bg-pale-sky-500 text-white font-bold hover:bg-pale-sky-600 transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إضافة' : 'Add'}</span>
                  </button>
                </div>

                {/* Contributor List */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {(formData.contributors || []).map((contrib, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-subtle text-main"
                    >
                      <span className="font-bold">{contrib.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-400 font-semibold">
                        {roleLabelMap[contrib.role]?.[lang === 'ar' ? 'ar' : 'en'] || contrib.role}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveContributor(idx)}
                        className="text-muted hover:text-red-500 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {(!formData.contributors || formData.contributors.length === 0) && (
                    <p className="text-[11px] text-muted py-1">
                      {lang === 'ar' ? 'لم يُضف أي مساهم إضافي حتى الآن.' : 'No additional contributors added yet.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Categories & Tags */}
              <div className="p-4 rounded-2xl bg-canvas border border-subtle space-y-3">
                <h4 className="font-bold text-main flex items-center gap-1.5 text-xs text-pale-sky-600 dark:text-pale-sky-400">
                  <Tag className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'التصنيف الهرمي والوسوم' : 'Category & Tags'}</span>
                </h4>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="font-bold text-main text-xs">
                      {lang === 'ar' ? 'التصنيف الرئيسي:' : 'Primary Category:'}
                    </label>
                    <CategoryCascader
                      value={formData.primaryCategory?.id || ''}
                      onChange={(catId, catObj) => {
                        setFormData((prev) => ({
                          ...prev,
                          primaryCategory: catId && catObj ? { id: catId, nameAr: catObj.nameAr, nameEn: catObj.nameEn || '' } : undefined,
                        }));
                      }}
                      placeholder={lang === 'ar' ? '-- بدون تصنيف رئيسي --' : '-- No Category --'}
                      allowClear={true}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-bold text-main text-xs">
                      {t('tagEditorLabel')}
                    </label>
                    <TagEditor
                      value={formData.tags || formData.categories || []}
                      onChange={(newTags) => {
                        setFormData((prev) => ({
                          ...prev,
                          tags: newTags,
                          categories: newTags,
                        }));
                      }}
                      placeholder={t('addTagPlaceholder')}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LENDING HISTORY */}
          {activeTab === 'lending' && (
            <div className="space-y-4">
              {/* Add Loan Card */}
              <div className="p-4 rounded-2xl bg-canvas border border-subtle space-y-3">
                <h4 className="font-bold text-main text-xs flex items-center gap-1.5 text-pale-sky-600 dark:text-pale-sky-400">
                  <UserCheck className="w-4 h-4" />
                  <span>{t('lendModalTitle')}</span>
                </h4>

                {/* Quick borrower chips */}
                {pastBorrowers.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted font-bold flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      <span>{t('knownBorrowersLabel')}</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto">
                      {pastBorrowers.slice(0, 6).map((b) => (
                        <button
                          key={b.borrowerName}
                          type="button"
                          onClick={() => {
                            setNewBorrower(b.borrowerName);
                            if (b.borrowerContact) setNewBorrowerContact(b.borrowerContact);
                          }}
                          className="text-[10px] px-2 py-0.5 rounded-lg bg-surface border border-subtle hover:border-amber-500/50 text-main transition-colors cursor-pointer"
                        >
                          {b.borrowerName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted font-bold">{t('borrowerName')}</span>
                    <input
                      type="text"
                      list="past-borrower-names"
                      placeholder={t('borrowerNamePlaceholder')}
                      value={newBorrower}
                      onChange={(e) => setNewBorrower(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                    <datalist id="past-borrower-names">
                      {pastBorrowers.map((b) => (
                        <option key={b.borrowerName} value={b.borrowerName} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted font-bold">{t('borrowerContact')}</span>
                    <input
                      type="text"
                      placeholder={t('borrowerContactPlaceholder')}
                      value={newBorrowerContact}
                      onChange={(e) => setNewBorrowerContact(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted">{t('borrowDate')}</span>
                    <input
                      type="date"
                      value={newBorrowDate}
                      onChange={(e) => setNewBorrowDate(e.target.value)}
                      className="w-full p-2 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted">{t('expectedReturnDate')}</span>
                    <input
                      type="date"
                      value={newReturnDate}
                      onChange={(e) => setNewReturnDate(e.target.value)}
                      className="w-full p-2 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted">{t('loanConditionOut')}</span>
                    <select
                      value={newLendingConditionOut}
                      onChange={(e) => setNewLendingConditionOut(e.target.value)}
                      className="w-full p-2 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors cursor-pointer"
                    >
                      <option value="mint">{t('conditionMint')}</option>
                      <option value="good">{t('conditionGood')}</option>
                      <option value="fair">{t('conditionFair')}</option>
                      <option value="poor">{t('conditionPoor')}</option>
                      <option value="antique">{t('conditionAntique')}</option>
                    </select>
                  </div>

                  <div className="space-y-0.5 sm:col-span-2">
                    <span className="text-[10px] text-muted">{t('notesOptional')}</span>
                    <input
                      type="text"
                      placeholder={t('notesPlaceholder')}
                      value={newLendingNotes}
                      onChange={(e) => setNewLendingNotes(e.target.value)}
                      className="w-full p-2 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddLending}
                  disabled={!newBorrower.trim()}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-white font-bold hover:bg-amber-600 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm text-xs disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('confirmLend')}</span>
                </button>
              </div>

              {/* Loans List */}
              <div className="space-y-2">
                <h5 className="font-bold text-main text-xs">{t('lendingHistoryTitle')}</h5>
                {(formData.lendingHistory?.length || 0) > 0 ? (
                  (formData.lendingHistory || []).map((rec) => {
                    const today = new Date().toISOString().split('T')[0];
                    const isOverdue = !rec.isReturned && rec.expectedReturnDate && rec.expectedReturnDate < today;

                    return (
                      <div
                        key={rec.id}
                        className="p-3.5 rounded-2xl bg-canvas border border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-main text-xs">{rec.borrowerName}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                rec.isReturned
                                  ? 'bg-evergreen-500/10 text-evergreen-600 dark:text-evergreen-400'
                                  : isOverdue
                                  ? 'bg-red-500/10 text-red-600 dark:text-red-400 animate-pulse'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {rec.isReturned
                                ? t('returnedBadge')
                                : isOverdue
                                ? t('lendingStatusOverdue')
                                : t('activeLoanBadge')}
                            </span>
                            {rec.borrowerContact && (
                              <span className="text-[11px] text-muted font-mono">{rec.borrowerContact}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted">
                            {t('borrowDate')}: <span className="font-mono text-main">{rec.borrowDate}</span> •{' '}
                            {t('expectedReturnDate')}:{' '}
                            <span className={`font-mono ${isOverdue ? 'text-red-500 font-bold' : 'text-main'}`}>
                              {rec.expectedReturnDate}
                            </span>
                            {rec.actualReturnDate && (
                              <span>
                                {' '}
                                • {t('actualReturnDate')}:{' '}
                                <span className="font-mono text-evergreen-600 dark:text-evergreen-400">
                                  {rec.actualReturnDate}
                                </span>
                              </span>
                            )}
                          </p>
                          {rec.conditionOnReturn && (
                            <p className="text-[10px] text-muted">
                              {t('conditionOnReturn')}:{' '}
                              <strong className="text-main">{rec.conditionOnReturn}</strong>
                            </p>
                          )}
                          {rec.notes && <p className="text-[11px] text-muted italic">&quot;{rec.notes}&quot;</p>}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleReturn(rec)}
                          className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                            rec.isReturned
                              ? 'border-subtle hover:bg-surface text-muted'
                              : 'bg-evergreen-500/15 border-evergreen-500/30 text-evergreen-600 dark:text-evergreen-400 hover:bg-evergreen-500/25'
                          }`}
                        >
                          {rec.isReturned ? t('undoReturnBtn') : t('markReturnedBtn')}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-muted py-6 text-xs">
                    {t('noLendingHistory')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* MODAL FOOTER                                                      */}
        {/* ================================================================= */}
        <div className="p-4 sm:p-5 bg-canvas border-t border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!isCreateMode && (
              <>
                <button
                  type="button"
                  onClick={() => onDelete(formData.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-500 hover:bg-red-500/10 text-xs font-bold transition-all cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('deleteFromLibrary')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGeekModal(true)}
                  title={t('geekDetailsTooltip')}
                  aria-label={t('geekDetailsBtn')}
                  className="size-7 shrink-0 inline-flex items-center justify-center rounded-lg border border-subtle bg-surface/40 hover:bg-surface text-muted hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
                >
                  <Terminal className="w-3.5 h-3.5 opacity-70" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAttemptClose}
              className="px-4 py-2 rounded-xl border border-subtle text-muted hover:text-main hover:bg-surface text-xs font-semibold transition-all cursor-pointer"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              disabled={!validation.isValid || (formData.workType === 'book' && !!bookVolumeIssue(formData))}
              onClick={async () => {
                if (validation.isValid) {
                  const toSave = { ...formData };
                  if (
                    !toSave.coverImage &&
                    toSave.filePath &&
                    toSave.filePath.toLowerCase().endsWith('.pdf') &&
                    typeof window.electronAPI?.extractPdfCover === 'function'
                  ) {
                    try {
                      const pdfCoverRes = await (window).electronAPI.extractPdfCover(toSave.filePath);
                      if (pdfCoverRes?.success && pdfCoverRes.coverUrl) {
                        toSave.coverImage = pdfCoverRes.coverUrl;
                      }
                    } catch (err) {
                      console.warn('[BookDetailModal] Auto PDF cover extraction on save error:', err);
                    }
                  } else if (
                    !toSave.coverImage &&
                    toSave.filePath &&
                    toSave.filePath.toLowerCase().endsWith('.epub') &&
                    typeof window.electronAPI?.extractEpubCover === 'function'
                  ) {
                    try {
                      const epubCoverRes = await (window).electronAPI.extractEpubCover(toSave.filePath);
                      if (epubCoverRes?.success && epubCoverRes.coverUrl) {
                        toSave.coverImage = epubCoverRes.coverUrl;
                      }
                    } catch (err) {
                      console.warn('[BookDetailModal] Auto EPUB cover extraction on save error:', err);
                    }
                  }
                  onSave(toSave);
                  onClose();
                }
              }}
              className={`px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer ${
                validation.isValid
                  ? 'bg-pale-sky-500 text-white hover:bg-pale-sky-600'
                  : 'bg-muted/40 text-muted cursor-not-allowed'
              }`}
            >
              {isCreateMode ? (
                <>
                  <Plus className="w-4 h-4" />
                  <span>{t('addToLibrary')}</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{t('saveChanges')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Ranked metadata candidates selection modal */}
        {showCandidatesModal && (
          <MetadataCandidatesModal
            isOpen={showCandidatesModal}
            searchTitle={formData.title}
            searchAuthor={formData.author}
            searchIsbn={formData.isbn}
            filePath={formData.filePath}
            fileSize={formData.fileSize}
            candidates={lookupHook.candidates}
            evaluations={lookupHook.evaluations}
            selectedWork={selectedCandidateWork}
            onSelectWork={(work) => setSelectedCandidateWork(work)}
            onProceed={handleProceedFromCandidates}
            onClose={() => setShowCandidatesModal(false)}
            onSearchDeeper={lookupHook.searchDeeper}
            isSearchingDeeper={lookupHook.isSearchingDeeper}
          />
        )}

        {/* Side-by-side metadata diff modal */}
        {showDiffModal && fetchedWork && (
          <MetadataDiffModal
            isOpen={showDiffModal}
            currentBook={formData}
            incomingWork={fetchedWork}
            candidateCount={lookupHook.candidates.length}
            onBackToCandidates={lookupHook.candidates.length > 1 ? handleBackToCandidatesFromDiff : undefined}
            onClose={() => {
              setShowDiffModal(false);
              setFetchedWork(null);
            }}
            onApply={handleApplyDiffUpdates}
          />
        )}

        {/* Provider configuration and priority modal */}
        <ProviderSettingsModal
          isOpen={showProviderSettingsModal}
          onClose={() => setShowProviderSettingsModal(false)}
        />

        {/* Online Library Hub Modal for direct search & import */}
        <OnlineLibraryHub
          isOpen={isOnlineHubOpen}
          onClose={() => setIsOnlineHubOpen(false)}
          onImportBook={handleImportFromOnlineHub}
        />

        {/* Return Book Modal with condition audit */}
        <ReturnBookModal
          isOpen={!!selectedLoanForReturn}
          book={formData}
          activeLoan={selectedLoanForReturn}
          onClose={() => setSelectedLoanForReturn(null)}
          onSuccess={handleReturnSuccess}
        />

        {/* Story 12: Contextual Online Edition Comparison & Safe Merging */}
        <EditionComparisonModal
          isOpen={isFindOnlineModalOpen}
          book={formData}
          onClose={() => setIsFindOnlineModalOpen(false)}
          onEnrichmentApplied={handleEnrichmentApplied}
        />

        {/* Geek Metadata Diagnostics Modal */}
        <GeekMetadataModal
          isOpen={showGeekModal}
          onClose={() => setShowGeekModal(false)}
          book={formData}
        />
      </div>
    </div>
  );
};
