'use client';

import React, { useState, useRef, useMemo } from 'react';
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
  Compass
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
  isValidIssn
} from '../../../shared/validators/metadata-validator';
import { useWorkspace } from '../context/WorkspaceContext';

interface BookDetailModalProps {
  book: BookItem | null;
  isOpen: boolean;
  isNew?: boolean;
  allCategories?: { id: string; nameAr: string; nameEn: string }[];
  onClose: () => void;
  onSave: (updatedBook: BookItem) => void;
  onDelete: (id: string) => void;
}

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  isOpen,
  isNew,
  allCategories = [],
  onClose,
  onSave,
  onDelete,
}) => {
  const { lang, dir, t, books } = useWorkspace();

  const isCreateMode = isNew ?? (book ? !books.some((b) => b.id === book.id) : true);

  const [formData, setFormData] = useState<BookItem>(book || ({} as BookItem));
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const [showConfirmDiscard, setShowConfirmDiscard] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'info' | 'physical' | 'classification' | 'lending'>('info');
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillSuccess, setAutoFillSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Contributor form state
  const [newContribName, setNewContribName] = useState('');
  const [newContribRole, setNewContribRole] = useState<ContributorRole>('author');

  // Lending form state
  const [newBorrower, setNewBorrower] = useState('');
  const [newBorrowerContact, setNewBorrowerContact] = useState('');
  const [newBorrowDate, setNewBorrowDate] = useState(new Date().toISOString().split('T')[0]);
  const [newReturnDate, setNewReturnDate] = useState('');
  const [newLendingNotes, setNewLendingNotes] = useState('');

  // Sync state when book changes
  React.useEffect(() => {
    if (book) {
      const initial: BookItem = {
        ...book,
        workType: book.workType || 'book',
        workTypeId: book.workTypeId || 'wt-book',
        contributors: book.contributors || [],
        lendingHistory: book.lendingHistory || [],
      };
      setFormData(initial);
      setInitialSnapshot(JSON.stringify(initial));
      setShowConfirmDiscard(false);
      setActiveTab('info');
    }
  }, [book, isOpen]);

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

  // Keyboard shortcut (Escape)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showConfirmDiscard) {
          setShowConfirmDiscard(false);
        } else {
          handleAttemptClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, showConfirmDiscard]);

  // Real-time type-aware validation
  const validation = useMemo(() => {
    return validateWorkMetadata(formData);
  }, [formData]);

  const handleInputChange = (field: keyof BookItem, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleWorkTypeChange = (key: WorkTypeKey) => {
    const info = WORK_TYPES[key];
    setFormData((prev) => ({
      ...prev,
      workType: key,
      workTypeId: info.id,
    }));
  };

  const handlePickFileNative = async () => {
    const windowAPI = (window as any).electronAPI;
    if (windowAPI?.openFileDialog) {
      const fullPath: string | null = await windowAPI.openFileDialog();
      if (!fullPath) return;

      const pathSegments = fullPath.split(/[/\\]/);
      const fileNameWithExt = pathSegments[pathSegments.length - 1];
      const ext = fileNameWithExt.split('.').pop()?.toUpperCase() || 'PDF';

      setFormData((prev) => ({
        ...prev,
        filePath: fullPath,
        digitalFormat: ext as any,
        bookType: prev.bookType === 'physical' ? 'hybrid' : 'digital',
      }));
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChangeFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toUpperCase() || 'PDF';

    setFormData((prev) => ({
      ...prev,
      filePath: (file as any).path || file.name,
      digitalFormat: ext as any,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      bookType: prev.bookType === 'physical' ? 'hybrid' : 'digital',
    }));
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
  const handleAddLending = () => {
    if (!newBorrower.trim()) return;
    const newRecord: LendingRecord = {
      id: `lend-${Date.now()}`,
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
    setNewBorrower('');
    setNewBorrowerContact('');
    setNewLendingNotes('');
  };

  const handleToggleReturn = (lendId: string) => {
    setFormData((prev) => ({
      ...prev,
      lendingHistory: (prev.lendingHistory || []).map((rec) =>
        rec.id === lendId
          ? {
              ...rec,
              isReturned: !rec.isReturned,
              actualReturnDate: !rec.isReturned ? new Date().toISOString().split('T')[0] : undefined,
              conditionOnReturn: !rec.isReturned ? 'سليمة' : undefined,
            }
          : rec
      ),
    }));
  };

  // OpenLibrary / Google Books Auto-Fill
  const fetchMetadataAutoFill = async () => {
    setIsAutoFilling(true);
    try {
      const cleanIsbn = formData.isbn?.replace(/-/g, '').trim();
      const query = cleanIsbn || encodeURIComponent(formData.title);

      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}`);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        const volumeInfo = data.items[0].volumeInfo;

        setFormData((prev) => ({
          ...prev,
          title: prev.title || volumeInfo.title,
          author: prev.author !== 'مؤلف مجهول' ? prev.author : (volumeInfo.authors ? volumeInfo.authors.join(', ') : prev.author),
          publisher: volumeInfo.publisher || prev.publisher,
          publicationYear: volumeInfo.publishedDate ? parseInt(volumeInfo.publishedDate.substring(0, 4)) : prev.publicationYear,
          isbn: prev.isbn || (volumeInfo.industryIdentifiers ? volumeInfo.industryIdentifiers[0]?.identifier : prev.isbn),
          categories: Array.from(new Set([...(prev.categories || []), ...(volumeInfo.categories || [])])),
          coverImage: volumeInfo.imageLinks?.thumbnail || prev.coverImage,
        }));
      }

      setIsAutoFilling(false);
      setAutoFillSuccess(true);
      setTimeout(() => setAutoFillSuccess(false), 2500);
    } catch (err) {
      console.warn('Auto-fill API fallback:', err);
      setIsAutoFilling(false);
    }
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
        className="relative w-full max-w-4xl bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] font-sans"
        dir={dir}
      >
        {/* Unsaved Changes Confirmation Dialog Overlay */}
        {showConfirmDiscard && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-surface border border-subtle rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4">
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
        <div className="p-4 sm:p-5 bg-canvas/90 border-b border-subtle flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-pale-sky-500/15 border border-pale-sky-500/30 flex items-center justify-center text-pale-sky-500 shrink-0 shadow-sm">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-main text-base sm:text-lg truncate">
                  {isCreateMode ? t('addMaterialTitle') : (formData.title || t('editMaterialTitle'))}
                </h3>
                {isDirty && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold shrink-0">
                    {lang === 'ar' ? 'تعديلات غير محفوظة' : 'Unsaved changes'}
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
            <button
              onClick={fetchMetadataAutoFill}
              disabled={isAutoFilling}
              title={t('autoFillTooltip')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isAutoFilling ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isAutoFilling
                  ? t('autoFillingWeb')
                  : t('autoFillWeb')}
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

        {/* Success Banner */}
        {autoFillSuccess && (
          <div className="bg-evergreen-500/10 border-b border-evergreen-500/20 px-4 py-2 text-xs text-evergreen-600 dark:text-evergreen-400 font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{lang === 'ar' ? 'تم جلب البيانات بنجاح من المراجع المفتوحة!' : 'Metadata fetched successfully!'}</span>
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
            {lang === 'ar' ? 'نوع المصنف:' : 'Work Type:'}
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {/* TAB 1: INFO & TYPE-SPECIFIC FIELDS */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Linked File Card */}
              <div className="p-3.5 rounded-2xl bg-canvas border border-subtle flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileCheck className="w-5 h-5 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold text-main block truncate">
                      {formData.filePath
                        ? (lang === 'ar' ? 'الملف الرقمي المربوط بالجهاز' : 'Linked Digital File')
                        : (lang === 'ar' ? 'لم يتم ربط ملف رقمي' : 'No Digital File Linked')}
                    </span>
                    <span className="text-[11px] text-muted font-mono truncate max-w-md block">
                      {formData.filePath || (lang === 'ar' ? 'اختر ملف من الجهاز لربطه بهذا العمل' : 'Select local PDF/EPUB to associate')}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handlePickFileNative}
                  className="px-3 py-1.5 rounded-xl bg-surface border border-subtle hover:bg-canvas text-main font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-sm"
                >
                  <FolderOpen className="w-4 h-4 text-amber-500" />
                  <span>{formData.filePath ? (lang === 'ar' ? 'تغيير الملف' : 'Change File') : (lang === 'ar' ? 'اختيار ملف' : 'Select File')}</span>
                </button>
              </div>

              {/* Shared Primary Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-bold text-main flex items-center gap-1">
                    <span>{lang === 'ar' ? 'العنوان الرئيسي' : 'Title'}</span>
                    <span className="text-red-500">*</span>
                  </label>
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
                  <label className="font-bold text-main">{lang === 'ar' ? 'لغة العمل' : 'Language'}</label>
                  <select
                    value={formData.language || 'العربية'}
                    onChange={(e) => handleInputChange('language', e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-canvas border border-subtle text-main outline-none focus:border-pale-sky-500"
                  >
                    <option value="العربية">العربية (Arabic)</option>
                    <option value="English">English</option>
                    <option value="الفرنسية">الفرنسية (French)</option>
                    <option value="الفارسية">الفارسية (Persian)</option>
                    <option value="التركية">التركية (Turkish)</option>
                  </select>
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
                    onChange={(e) => handleInputChange('bookType', e.target.value)}
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
                        {formData.isbn && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isValidIsbn(formData.isbn) ? 'bg-evergreen-500/10 text-evergreen-600' : 'bg-red-500/10 text-red-600'}`}>
                            {isValidIsbn(formData.isbn) ? '✓ ISBN صالح' : '✗ غير صالح'}
                          </span>
                        )}
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
                    <div className="space-y-1">
                      <label className="font-bold text-main">{lang === 'ar' ? 'الطبعة (Edition):' : 'Edition:'}</label>
                      <input
                        type="text"
                        value={formData.edition || ''}
                        onChange={(e) => handleInputChange('edition', e.target.value)}
                        placeholder={lang === 'ar' ? 'مثال: الطبعة الثالثة' : 'e.g. 3rd Edition'}
                        className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                      />
                    </div>
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
            </div>
          )}

          {/* TAB 2: PHYSICAL LOCATION & ACQUISITION */}
          {activeTab === 'physical' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-canvas border border-subtle space-y-3">
                <h4 className="font-bold text-main flex items-center gap-1.5 text-xs text-pale-sky-600 dark:text-pale-sky-400">
                  <MapPin className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'التسلسل الهرمي للموقع في المكتبة' : 'Physical Location Hierarchy'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? '1. الغرفة أو القاعة (Room):' : '1. Room:'}</label>
                    <input
                      type="text"
                      value={formData.room || ''}
                      onChange={(e) => handleInputChange('room', e.target.value)}
                      placeholder={lang === 'ar' ? 'المكتبة الرئيسية / غرفة المكتب' : 'Main Study'}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? '2. الخزانة أو الدولاب (Bookcase):' : '2. Bookcase:'}</label>
                    <input
                      type="text"
                      value={formData.bookcase || ''}
                      onChange={(e) => handleInputChange('bookcase', e.target.value)}
                      placeholder={lang === 'ar' ? 'خزانة رقم 3 - كتب التراث' : 'Bookcase #3'}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? '3. الرف (Shelf):' : '3. Shelf:'}</label>
                    <input
                      type="text"
                      value={formData.shelf || ''}
                      onChange={(e) => handleInputChange('shelf', e.target.value)}
                      placeholder={lang === 'ar' ? 'رف رقم 2' : 'Shelf 2'}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? '4. قسم الرف (Shelf Section):' : '4. Shelf Section:'}</label>
                    <input
                      type="text"
                      value={formData.shelfSection || ''}
                      onChange={(e) => handleInputChange('shelfSection', e.target.value)}
                      placeholder={lang === 'ar' ? 'القسم الأوسط / الجزء الأيمن' : 'Middle Section'}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-canvas border border-subtle space-y-3">
                <h4 className="font-bold text-main flex items-center gap-1.5 text-xs text-pale-sky-600 dark:text-pale-sky-400">
                  <DollarSign className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'معلومات الاقتناء والحالة الفيزيائية' : 'Acquisition & Physical Condition'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? 'حالة النسخة:' : 'Condition:'}</label>
                    <select
                      value={formData.condition || 'ممتازة'}
                      onChange={(e) => handleInputChange('condition', e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                    >
                      <option value="جديدة">{lang === 'ar' ? 'جديدة (New)' : 'New'}</option>
                      <option value="ممتازة">{lang === 'ar' ? 'ممتازة (Like New)' : 'Like New'}</option>
                      <option value="جيدة">{lang === 'ar' ? 'جيدة (Good)' : 'Good'}</option>
                      <option value="مستعملة">{lang === 'ar' ? 'مستعملة (Used)' : 'Used'}</option>
                      <option value="أثرية/قديمة">{lang === 'ar' ? 'أثرية/قديمة (Rare/Antique)' : 'Antique'}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? 'تاريخ الشراء:' : 'Purchase Date:'}</label>
                    <input
                      type="date"
                      value={formData.purchaseDate || ''}
                      onChange={(e) => handleInputChange('purchaseDate', e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? 'سعر الشراء:' : 'Price:'}</label>
                    <input
                      type="text"
                      value={formData.price || ''}
                      onChange={(e) => handleInputChange('price', e.target.value)}
                      placeholder="150 IQD / SAR"
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
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

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? 'التصنيف الرئيسي:' : 'Primary Category:'}</label>
                    <select
                      value={formData.primaryCategory?.id || ''}
                      onChange={(e) => {
                        const selected = allCategories.find((c) => c.id === e.target.value);
                        setFormData((prev) => ({
                          ...prev,
                          primaryCategory: selected || null,
                        }));
                      }}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                    >
                      <option value="">{lang === 'ar' ? '-- بدون تصنيف رئيسي --' : '-- No Category --'}</option>
                      {allCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {lang === 'ar' ? c.nameAr : c.nameEn}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-main">{lang === 'ar' ? 'التصنيفات الإضافية (مفصولة بفواصل):' : 'Additional Categories (comma-separated):'}</label>
                    <input
                      type="text"
                      value={(formData.categories || []).join(', ')}
                      onChange={(e) =>
                        handleInputChange(
                          'categories',
                          e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                        )
                      }
                      placeholder={lang === 'ar' ? 'عقيدة, فقه, تراث...' : 'Theology, History, Linguistics...'}
                      className="w-full p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
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
                  <span>{lang === 'ar' ? 'تسجيل إعارة جديدة' : 'Record New Loan'}</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    placeholder={lang === 'ar' ? 'اسم المستعير...' : 'Borrower name...'}
                    value={newBorrower}
                    onChange={(e) => setNewBorrower(e.target.value)}
                    className="p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                  />
                  <input
                    type="text"
                    placeholder={lang === 'ar' ? 'رقم الهاتف أو البريد...' : 'Contact info (phone/email)...'}
                    value={newBorrowerContact}
                    onChange={(e) => setNewBorrowerContact(e.target.value)}
                    className="p-2.5 rounded-xl bg-surface border border-subtle text-main outline-none"
                  />
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted">{lang === 'ar' ? 'تاريخ الاستعارة:' : 'Borrow Date:'}</span>
                    <input
                      type="date"
                      value={newBorrowDate}
                      onChange={(e) => setNewBorrowDate(e.target.value)}
                      className="w-full p-2 rounded-xl bg-surface border border-subtle text-main outline-none"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-muted">{lang === 'ar' ? 'التاريخ المتوقع للإرجاع:' : 'Expected Return:'}</span>
                    <input
                      type="date"
                      value={newReturnDate}
                      onChange={(e) => setNewReturnDate(e.target.value)}
                      className="w-full p-2 rounded-xl bg-surface border border-subtle text-main outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder={lang === 'ar' ? 'ملاحظات الإعارة (اختياري)...' : 'Loan notes (optional)...'}
                      value={newLendingNotes}
                      onChange={(e) => setNewLendingNotes(e.target.value)}
                      className="w-full p-2 rounded-xl bg-surface border border-subtle text-main outline-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddLending}
                  className="px-4 py-2 rounded-xl bg-pale-sky-500 text-white font-bold hover:bg-pale-sky-600 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'حفظ تسجيل الإعارة' : 'Record Loan'}</span>
                </button>
              </div>

              {/* Loans List */}
              <div className="space-y-2">
                {(formData.lendingHistory?.length || 0) > 0 ? (
                  (formData.lendingHistory || []).map((rec) => {
                    const today = new Date().toISOString().split('T')[0];
                    const isOverdue = !rec.isReturned && rec.expectedReturnDate && rec.expectedReturnDate < today;

                    return (
                      <div
                        key={rec.id}
                        className="p-3.5 rounded-2xl bg-canvas border border-subtle flex items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-main">{rec.borrowerName}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                rec.isReturned
                                  ? 'bg-evergreen-500/10 text-evergreen-600 dark:text-evergreen-400'
                                  : isOverdue
                                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {rec.isReturned
                                ? (lang === 'ar' ? 'تمت الإعادة' : 'Returned')
                                : isOverdue
                                ? (lang === 'ar' ? 'متأخرة عن الموعد!' : 'Overdue!')
                                : (lang === 'ar' ? 'قيد الإعارة حالياً' : 'Active Loan')}
                            </span>
                            {rec.borrowerContact && (
                              <span className="text-[11px] text-muted font-mono">{rec.borrowerContact}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted">
                            {lang === 'ar' ? 'تاريخ الإعارة:' : 'Borrow:'} {rec.borrowDate} • {lang === 'ar' ? 'المتوقع:' : 'Due:'} {rec.expectedReturnDate}
                            {rec.actualReturnDate && ` • ${lang === 'ar' ? 'أُعيد بتاريخ:' : 'Returned on:'} ${rec.actualReturnDate}`}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleReturn(rec.id)}
                          className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                            rec.isReturned
                              ? 'border-subtle hover:bg-surface text-muted'
                              : 'bg-evergreen-500/15 border-evergreen-500/30 text-evergreen-600 dark:text-evergreen-400 hover:bg-evergreen-500/25'
                          }`}
                        >
                          {rec.isReturned
                            ? (lang === 'ar' ? 'إلغاء الإرجاع' : 'Undo Return')
                            : (lang === 'ar' ? 'تسجيل الإرجاع ✓' : 'Mark Returned ✓')}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-muted py-6">
                    {lang === 'ar' ? 'لا توجد إعارات مسجلة لهذا العمل حتى الآن.' : 'No lending records logged for this item yet.'}
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
          <div>
            {!isCreateMode && (
              <button
                type="button"
                onClick={() => onDelete(formData.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-500 hover:bg-red-500/10 text-xs font-bold transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">{t('deleteFromLibrary')}</span>
              </button>
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
              disabled={!validation.isValid}
              onClick={() => {
                if (validation.isValid) {
                  onSave(formData);
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
      </div>
    </div>
  );
};
