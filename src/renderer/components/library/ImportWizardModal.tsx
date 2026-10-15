'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Layers,
  Trash2,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  ArrowLeft,
  Check,
  BookOpen,
  FileCheck2,
  ExternalLink,
  ShieldCheck,
  Copy,
  PlusCircle
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  DuplicateDetectionResult,
  DuplicateResolutionAction,
  ImportProgressEvent,
  BatchImportSummary,
  DigitalFormat,
  DigitalImportResult
} from '../../types/library';

export interface StagedFileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  format: DigitalFormat;
}

interface ImportWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

type WizardStep = 'select' | 'duplicates' | 'importing' | 'summary';

export const ImportWizardModal: React.FC<ImportWizardModalProps> = ({
  isOpen,
  onClose,
  onImportComplete
}) => {
  const { t, dir, lang, refreshBooks } = useWorkspace();

  const [step, setStep] = useState<WizardStep>('select');
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Batch Configuration
  const [batchCategory, setBatchCategory] = useState<string>('');
  const [batchReadingStatus, setBatchReadingStatus] = useState<
    'unread' | 'reading' | 'completed'
  >('unread');
  const [categoriesList, setCategoriesList] = useState<
    { id: string; nameAr: string; nameEn: string }[]
  >([]);

  // Duplicate Resolution States
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false);
  const [duplicateResults, setDuplicateResults] = useState<DuplicateDetectionResult[]>([]);
  const [fileActions, setFileActions] = useState<Record<string, DuplicateResolutionAction>>({});

  // Live Import Progress States
  const [progressEvent, setProgressEvent] = useState<ImportProgressEvent | null>(null);
  const [importSummary, setImportSummary] = useState<BatchImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Load category options on modal open
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI
        .getCategoryTree()
        .then((tree: any) => {
          if (Array.isArray(tree)) {
            const flat: { id: string; nameAr: string; nameEn: string }[] = [];
            const walk = (nodes: any[]) => {
              for (const n of nodes) {
                flat.push({ id: n.id, nameAr: n.nameAr, nameEn: n.nameEn });
                if (n.children && n.children.length > 0) walk(n.children);
              }
            };
            walk(tree);
            setCategoriesList(flat);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // Reset states when closed
  const handleModalClose = () => {
    if (isImporting) return; // Prevent closing mid-import
    setStep('select');
    setStagedFiles([]);
    setDuplicateResults([]);
    setFileActions({});
    setProgressEvent(null);
    setImportSummary(null);
    setIsImporting(false);
    onClose();
  };

  if (!isOpen) return null;

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, idx);
    return `${value.toFixed(1)} ${units[idx]}`;
  };

  const getFormatFromFileName = (fileName: string): DigitalFormat => {
    const ext = fileName.split('.').pop()?.toUpperCase() || '';
    if (['PDF', 'EPUB', 'MOBI', 'AZW3', 'TXT', 'HTML', 'DJVU'].includes(ext)) {
      return ext as DigitalFormat;
    }
    return 'PDF';
  };

  // Add files to stage
  const addFilesToStage = (fileList: { name: string; path: string; size?: number }[]) => {
    const supportedExts = new Set(['pdf', 'epub', 'mobi', 'azw3', 'txt', 'html', 'djvu']);
    const newItems: StagedFileItem[] = [];

    for (const f of fileList) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!supportedExts.has(ext)) continue;

      // Avoid exact path duplicate in current stage
      const alreadyStaged = stagedFiles.some((s) => s.path === f.path);
      if (alreadyStaged) continue;

      newItems.push({
        id: `staged-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        path: f.path,
        size: f.size || 0,
        format: getFormatFromFileName(f.name)
      });
    }

    if (newItems.length > 0) {
      setStagedFiles((prev) => [...prev, ...newItems]);
    }
  };

  // Native File Picker trigger
  const handleBrowseFiles = async () => {
    const api = (window as any).electronAPI;
    if (api?.openFilesDialog) {
      const selectedPaths: string[] = await api.openFilesDialog();
      if (Array.isArray(selectedPaths) && selectedPaths.length > 0) {
        const items = selectedPaths.map((p) => {
          const name = p.split(/[/\\]/).pop() || p;
          return { name, path: p };
        });
        addFilesToStage(items);
      }
    } else if (api?.openFileDialog) {
      const singlePath: string | null = await api.openFileDialog();
      if (singlePath) {
        const name = singlePath.split(/[/\\]/).pop() || singlePath;
        addFilesToStage([{ name, path: singlePath }]);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  // HTML fallback input
  const handleFallbackInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const items: { name: string; path: string; size?: number }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      items.push({
        name: f.name,
        path: (f as any).path || f.name,
        size: f.size
      });
    }
    addFilesToStage(items);
  };

  // Drag and Drop handlers inside modal drop zone
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const items: { name: string; path: string; size?: number }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      items.push({
        name: f.name,
        path: (f as any).path || f.name,
        size: f.size
      });
    }
    addFilesToStage(items);
  };

  const handleRemoveStaged = (id: string) => {
    setStagedFiles((prev) => prev.filter((s) => s.id !== id));
  };

  // Proceed to Step 2: Check Duplicates
  const handleScanDuplicates = async () => {
    if (stagedFiles.length === 0) return;
    setIsScanningDuplicates(true);
    setStep('duplicates');

    try {
      const api = (window as any).electronAPI;
      if (api?.checkDigitalDuplicates) {
        const inputs = stagedFiles.map((s) => ({
          filePath: s.path,
          fileSizeBytes: s.size
        }));
        const results: DuplicateDetectionResult[] = await api.checkDigitalDuplicates(inputs);
        setDuplicateResults(results);

        // Pre-fill default actions
        const initialActions: Record<string, DuplicateResolutionAction> = {};
        for (const res of results) {
          if (res.matchType !== 'none') {
            const suggested: DuplicateResolutionAction =
              res.matchType === 'exact_file'
                ? 'skip'
                : res.matchType === 'same_edition'
                ? 'add_new_edition'
                : 'import_anyway';
            initialActions[res.filePath] = suggested;
          }
        }
        setFileActions(initialActions);
      } else {
        // Fallback when IPC is not available in mock/test
        setDuplicateResults([]);
      }
    } catch (err) {
      console.error('[ImportWizard] Failed to check duplicates:', err);
      setDuplicateResults([]);
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  // Step 3: Trigger batch import backend
  const handleStartImport = async () => {
    if (stagedFiles.length === 0) return;
    setIsImporting(true);
    setStep('importing');

    // Subscribe to streaming progress
    const api = (window as any).electronAPI;
    let unsubscribeProgress: (() => void) | undefined;
    if (api?.onDigitalImportProgress) {
      unsubscribeProgress = api.onDigitalImportProgress((progress: ImportProgressEvent) => {
        setProgressEvent(progress);
      });
    }

    try {
      const optionsList = stagedFiles.map((s) => ({
        filePath: s.path,
        targetFormat: s.format,
        primaryCategoryId: batchCategory || undefined,
        readingStatus: batchReadingStatus,
        duplicateAction: fileActions[s.path] || 'skip',
        existingWorkId: duplicateResults.find((d) => d.filePath === s.path)
          ?.existingWork?.id
      }));

      const summary: BatchImportSummary = await api.importDigitalFiles(optionsList);
      setImportSummary(summary);
      setStep('summary');

      // Refresh workspace library books immediately without manual page reload
      await refreshBooks();
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (err) {
      console.error('[ImportWizard] Batch import failed:', err);
    } finally {
      if (unsubscribeProgress) {
        unsubscribeProgress();
      }
      setIsImporting(false);
    }
  };

  const conflictedResults = duplicateResults.filter((d) => d.matchType !== 'none');
  const BackArrow = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const ForwardArrow = dir === 'rtl' ? ArrowLeft : ArrowRight;

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 font-sans">
      <div
        dir={dir}
        className="w-full max-w-4xl max-h-[92vh] bg-surface border border-subtle rounded-3xl shadow-2xl overflow-hidden flex flex-col text-main animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-canvas/80 border-b border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-main">{t('importWizardTitle')}</h2>
              <p className="text-xs text-muted">{t('importWizardSubtitle')}</p>
            </div>
          </div>

          <button
            onClick={handleModalClose}
            disabled={isImporting}
            className="p-2 rounded-xl text-muted hover:text-main hover:bg-canvas transition-colors disabled:opacity-40 cursor-pointer"
            title="إغلاق المعالج"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Navigation Indicator */}
        <div className="px-6 py-3 bg-canvas/50 border-b border-subtle flex items-center justify-between text-xs font-semibold shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'select'
                  ? 'bg-pale-sky-500 text-white shadow-md'
                  : 'bg-pale-sky-500/20 text-pale-sky-500'
              }`}
            >
              1
            </span>
            <span className={step === 'select' ? 'text-pale-sky-500 font-bold' : 'text-muted'}>
              {t('stepSelectFiles')}
            </span>
          </div>

          <span className="text-muted/40">• • •</span>

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'duplicates'
                  ? 'bg-pale-sky-500 text-white shadow-md'
                  : step === 'importing' || step === 'summary'
                  ? 'bg-emerald-500/20 text-emerald-500'
                  : 'bg-canvas text-muted border border-subtle'
              }`}
            >
              2
            </span>
            <span className={step === 'duplicates' ? 'text-pale-sky-500 font-bold' : 'text-muted'}>
              {t('stepReviewDuplicates')}
            </span>
          </div>

          <span className="text-muted/40">• • •</span>

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                step === 'importing' || step === 'summary'
                  ? 'bg-pale-sky-500 text-white shadow-md'
                  : 'bg-canvas text-muted border border-subtle'
              }`}
            >
              3
            </span>
            <span
              className={
                step === 'importing' || step === 'summary'
                  ? 'text-pale-sky-500 font-bold'
                  : 'text-muted'
              }
            >
              {t('stepImporting')}
            </span>
          </div>
        </div>

        {/* Step Contents */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ========================================================================= */}
          {/* STEP 1: FILE SELECTION & STAGING                                          */}
          {/* ========================================================================= */}
          {step === 'select' && (
            <div className="space-y-6">
              {/* Drag & Drop Target Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-8 border-2 border-dashed rounded-3xl text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                  isDragOver
                    ? 'border-pale-sky-500 bg-pale-sky-500/10 scale-[0.99]'
                    : 'border-subtle bg-canvas/40 hover:bg-canvas/70'
                }`}
                onClick={handleBrowseFiles}
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFallbackInputChange}
                  accept=".pdf,.epub,.mobi,.azw3,.txt,.html,.djvu"
                  className="hidden"
                />

                <div className="w-16 h-16 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500 mb-3 shadow-inner">
                  <UploadCloud className="w-8 h-8 animate-pulse" />
                </div>

                <h3 className="font-bold text-base text-main mb-1">{t('dragDropWizardTitle')}</h3>
                <p className="text-xs text-muted mb-4">{t('dragDropWizardSubtitle')}</p>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBrowseFiles();
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-pale-sky-500 text-white text-xs font-bold hover:bg-pale-sky-600 shadow-md shadow-pale-sky-500/20 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  <span>{t('browseFilesBtn')}</span>
                </button>
              </div>

              {/* Staged Items List */}
              {stagedFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-main">
                    <span className="flex items-center gap-2">
                      <FileCheck2 className="w-4 h-4 text-emerald-500" />
                      <span>{t('stagedFilesHeading', { count: stagedFiles.length })}</span>
                    </span>

                    <button
                      onClick={() => setStagedFiles([])}
                      className="text-red-500 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('clearAllStaged')}</span>
                    </button>
                  </div>

                  <div className="max-h-52 overflow-y-auto space-y-2 pe-1">
                    {stagedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="px-4 py-2.5 rounded-2xl bg-canvas border border-subtle flex items-center justify-between text-xs hover:border-pale-sky-500/30 transition-all"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-pale-sky-500/10 text-pale-sky-500 flex items-center justify-center font-bold text-[10px] shrink-0">
                            {file.format}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-main truncate block">{file.name}</span>
                            <span className="text-[10px] text-muted font-mono">
                              {formatBytes(file.size)} • {file.path}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveStaged(file.id)}
                          className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-surface transition-colors cursor-pointer"
                          title="إزالة من القائمة"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Batch Options Accordion / Fields */}
                  <div className="p-4 rounded-2xl bg-canvas/60 border border-subtle space-y-3">
                    <h4 className="text-xs font-bold text-main flex items-center gap-2">
                      <Layers className="w-4 h-4 text-pale-sky-500" />
                      <span>{t('batchOptionsTitle')}</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="block text-[11px] text-muted mb-1 font-medium">
                          {t('batchCategoryLabel')}
                        </label>
                        <select
                          value={batchCategory}
                          onChange={(e) => setBatchCategory(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-surface border border-subtle text-main outline-none focus:border-pale-sky-500 cursor-pointer font-sans text-xs"
                        >
                          <option value="">(بدون تصنيف افتراضي)</option>
                          {categoriesList.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {lang === 'ar' ? cat.nameAr : cat.nameEn}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-muted mb-1 font-medium">
                          {t('batchReadingStatusLabel')}
                        </label>
                        <select
                          value={batchReadingStatus}
                          onChange={(e) =>
                            setBatchReadingStatus(
                              e.target.value as 'unread' | 'reading' | 'completed'
                            )
                          }
                          className="w-full px-3 py-2 rounded-xl bg-surface border border-subtle text-main outline-none focus:border-pale-sky-500 cursor-pointer font-sans text-xs"
                        >
                          <option value="unread">{t('statusUnread') || 'لم يُقرأ'}</option>
                          <option value="reading">{t('statusReading') || 'قيد القراءة'}</option>
                          <option value="completed">{t('statusCompleted') || 'مكتمل'}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 2: DUPLICATE DETECTION & CONFLICT REVIEW                             */}
          {/* ========================================================================= */}
          {step === 'duplicates' && (
            <div className="space-y-6">
              {isScanningDuplicates ? (
                <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
                  <RefreshCw className="w-10 h-10 text-pale-sky-500 animate-spin" />
                  <p className="text-sm font-bold text-main">
                    {t('scanningDuplicatesProgress')}
                  </p>
                </div>
              ) : conflictedResults.length === 0 ? (
                <div className="p-8 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold text-base text-main">{t('noDuplicatesHeading')}</h3>
                  <p className="text-xs text-muted max-w-md">{t('noDuplicatesDesc')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                    <p className="text-xs font-semibold text-main">
                      {t('duplicatesDetectedDesc', { count: conflictedResults.length })}
                    </p>
                  </div>

                  <div className="space-y-4 max-h-[50vh] overflow-y-auto pe-1">
                    {conflictedResults.map((dup) => {
                      const incomingPath = dup.filePath;
                      const defaultAction: DuplicateResolutionAction =
                        dup.matchType === 'exact_file'
                          ? 'skip'
                          : dup.matchType === 'same_edition'
                          ? 'add_new_edition'
                          : 'import_anyway';
                      const currentAction = fileActions[incomingPath] || defaultAction;

                      return (
                        <div
                          key={incomingPath}
                          className="p-5 rounded-3xl bg-canvas border border-subtle space-y-4"
                        >
                          {/* Match Header Badge */}
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                  dup.matchType === 'exact_file'
                                    ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                                    : dup.matchType === 'same_edition'
                                    ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                    : 'bg-pale-sky-500/10 text-pale-sky-600 border border-pale-sky-500/20'
                                }`}
                              >
                                {dup.matchType === 'exact_file'
                                  ? t('matchExactHash')
                                  : dup.matchType === 'same_edition'
                                  ? t('matchIsbn')
                                  : t('matchMetadata')}
                              </span>

                              <span className="text-[11px] font-mono text-muted">
                                {Math.round(dup.confidence * 100)}% Match
                              </span>
                            </div>

                            <span className="text-xs text-muted font-medium">{dup.reason}</span>
                          </div>

                          {/* Side-by-Side Comparison */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {/* Existing Book Card */}
                            <div className="p-3.5 rounded-2xl bg-surface border border-subtle space-y-2">
                              <span className="text-[11px] font-bold text-pale-sky-500 block">
                                {t('existingBookDetails')}
                              </span>
                              <div className="space-y-1">
                                <h5 className="font-bold text-main line-clamp-1">
                                  {dup.existingWork?.title || 'Unknown Title'}
                                </h5>
                                <p className="text-[11px] text-muted">
                                  {dup.existingWork?.author || t('noAuthor')}
                                </p>
                                {dup.existingWork?.isbn && (
                                  <p className="text-[10px] text-muted font-mono">
                                    ISBN: {dup.existingWork.isbn}
                                  </p>
                                )}
                                <p className="text-[10px] text-muted/70 truncate font-mono">
                                  {dup.existingWork?.filePath || 'No physical file linked'}
                                </p>
                              </div>
                            </div>

                            {/* Incoming File Card */}
                            <div className="p-3.5 rounded-2xl bg-surface border border-subtle space-y-2">
                              <span className="text-[11px] font-bold text-emerald-500 block">
                                {t('incomingFileDetails')}
                              </span>
                              <div className="space-y-1">
                                <h5 className="font-bold text-main line-clamp-1">
                                  {dup.fileName}
                                </h5>
                                <p className="text-[11px] text-muted">
                                  {formatBytes(dup.fileSizeBytes || 0)}
                                </p>
                                <p className="text-[10px] text-muted/70 truncate font-mono">
                                  {dup.filePath}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Resolution Choice Selectors */}
                          <div className="space-y-2 pt-2 border-t border-subtle/50">
                            <span className="text-[11px] font-bold text-main block">
                              {t('resolutionChoiceTitle')}
                            </span>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              {/* Skip Action */}
                              <label
                                className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                                  currentAction === 'skip'
                                    ? 'bg-pale-sky-500/10 border-pale-sky-500 text-main'
                                    : 'bg-surface border-subtle hover:bg-surface/80 text-muted'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`action-${incomingPath}`}
                                  value="skip"
                                  checked={currentAction === 'skip'}
                                  onChange={() =>
                                    setFileActions((prev) => ({ ...prev, [incomingPath]: 'skip' }))
                                  }
                                  className="mt-0.5 text-pale-sky-500 cursor-pointer"
                                />
                                <div>
                                  <span className="font-bold text-xs text-main block">
                                    {t('actionSkip')}
                                  </span>
                                  <span className="text-[10px] text-muted leading-tight block">
                                    {t('actionSkipDesc')}
                                  </span>
                                </div>
                              </label>

                              {/* Add as New Edition Action */}
                              <label
                                className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                                  currentAction === 'add_new_edition'
                                    ? 'bg-pale-sky-500/10 border-pale-sky-500 text-main'
                                    : 'bg-surface border-subtle hover:bg-surface/80 text-muted'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`action-${incomingPath}`}
                                  value="add_new_edition"
                                  checked={currentAction === 'add_new_edition'}
                                  onChange={() =>
                                    setFileActions((prev) => ({
                                      ...prev,
                                      [incomingPath]: 'add_new_edition'
                                    }))
                                  }
                                  className="mt-0.5 text-pale-sky-500 cursor-pointer"
                                />
                                <div>
                                  <span className="font-bold text-xs text-main block">
                                    {t('actionAddNewEdition')}
                                  </span>
                                  <span className="text-[10px] text-muted leading-tight block">
                                    {t('actionAddNewEditionDesc')}
                                  </span>
                                </div>
                              </label>

                              {/* Replace Action */}
                              <label
                                className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                                  currentAction === 'replace'
                                    ? 'bg-pale-sky-500/10 border-pale-sky-500 text-main'
                                    : 'bg-surface border-subtle hover:bg-surface/80 text-muted'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`action-${incomingPath}`}
                                  value="replace"
                                  checked={currentAction === 'replace'}
                                  onChange={() =>
                                    setFileActions((prev) => ({
                                      ...prev,
                                      [incomingPath]: 'replace'
                                    }))
                                  }
                                  className="mt-0.5 text-pale-sky-500 cursor-pointer"
                                />
                                <div>
                                  <span className="font-bold text-xs text-main block">
                                    {t('actionReplace')}
                                  </span>
                                  <span className="text-[10px] text-muted leading-tight block">
                                    {t('actionReplaceDesc')}
                                  </span>
                                </div>
                              </label>

                              {/* Import Anyway Action */}
                              <label
                                className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                                  currentAction === 'import_anyway'
                                    ? 'bg-pale-sky-500/10 border-pale-sky-500 text-main'
                                    : 'bg-surface border-subtle hover:bg-surface/80 text-muted'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`action-${incomingPath}`}
                                  value="import_anyway"
                                  checked={currentAction === 'import_anyway'}
                                  onChange={() =>
                                    setFileActions((prev) => ({
                                      ...prev,
                                      [incomingPath]: 'import_anyway'
                                    }))
                                  }
                                  className="mt-0.5 text-pale-sky-500 cursor-pointer"
                                />
                                <div>
                                  <span className="font-bold text-xs text-main block">
                                    {t('actionImportAnyway')}
                                  </span>
                                  <span className="text-[10px] text-muted leading-tight block">
                                    {t('actionImportAnywayDesc')}
                                  </span>
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3A: STREAMING IMPORT PROGRESS                                        */}
          {/* ========================================================================= */}
          {step === 'importing' && (
            <div className="p-8 space-y-6 text-center">
              <div className="w-16 h-16 rounded-3xl bg-pale-sky-500/10 border border-pale-sky-500/20 text-pale-sky-500 flex items-center justify-center mx-auto shadow-inner">
                <RefreshCw className="w-8 h-8 animate-spin" />
              </div>

              <div>
                <h3 className="font-bold text-base text-main">{t('importingLiveHeading')}</h3>
                <p className="text-xs text-muted mt-1">
                  {progressEvent
                    ? t('importProgressLabel', {
                        current: progressEvent.currentFileIndex,
                        total: progressEvent.totalFiles,
                        file: progressEvent.currentFilename
                      })
                    : 'جاري البدء...'}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md mx-auto space-y-2">
                <div className="h-2.5 w-full bg-canvas border border-subtle rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-pale-sky-500 to-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${progressEvent?.progressPercentage || 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted font-mono">
                  <span>{progressEvent?.progressPercentage || 0}%</span>
                  <span>
                    {progressEvent
                      ? progressEvent.status === 'validating'
                        ? t('phaseValidating')
                        : progressEvent.status === 'extracting'
                        ? t('phaseExtracting')
                        : progressEvent.status === 'saving'
                        ? t('phaseSaving')
                        : progressEvent.status
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* STEP 3B: BATCH IMPORT FINAL SUMMARY REPORT                                */}
          {/* ========================================================================= */}
          {step === 'summary' && importSummary && (
            <div className="space-y-6">
              <div className="p-6 rounded-3xl bg-canvas border border-subtle space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-main">
                      {t('importCompletedHeading')}
                    </h3>
                    <p className="text-xs text-muted">{t('importCompletedSummary')}</p>
                  </div>
                </div>

                {/* 4 Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-surface border border-subtle text-center">
                    <span className="text-[11px] text-muted block mb-1 font-medium">
                      {t('metricTotal')}
                    </span>
                    <span className="text-lg font-bold text-main font-mono">
                      {importSummary.totalFiles}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 block mb-1 font-medium">
                      {t('metricImported')}
                    </span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      {importSummary.successfulImports}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-pale-sky-500/10 border border-pale-sky-500/20 text-center">
                    <span className="text-[11px] text-pale-sky-600 dark:text-pale-sky-400 block mb-1 font-medium">
                      {t('metricSkipped')}
                    </span>
                    <span className="text-lg font-bold text-pale-sky-600 dark:text-pale-sky-400 font-mono">
                      {importSummary.skippedImports}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-center">
                    <span className="text-[11px] text-red-600 dark:text-red-400 block mb-1 font-medium">
                      {t('metricFailed')}
                    </span>
                    <span className="text-lg font-bold text-red-600 dark:text-red-400 font-mono">
                      {importSummary.failedImports}
                    </span>
                  </div>
                </div>
              </div>

              {/* Individual Item Results */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-main">تفاصيل الملفات المعالجة:</h4>
                <div className="max-h-52 overflow-y-auto space-y-2 pe-1">
                  {importSummary.results.map((res: DigitalImportResult, i: number) => (
                    <div
                      key={i}
                      className="px-4 py-2.5 rounded-2xl bg-canvas border border-subtle flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {res.skipped ? (
                          <Copy className="w-4 h-4 text-pale-sky-500 shrink-0" />
                        ) : res.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="font-bold text-main truncate block">{res.fileName}</span>
                          <span className="text-[10px] text-muted font-mono truncate block">
                            {res.extractedMetadata?.title
                              ? `${res.extractedMetadata.title} • ${
                                  res.extractedMetadata.author || ''
                                }`
                              : res.error || res.duplicateReason || res.filePath}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${
                          res.skipped
                            ? 'bg-pale-sky-500/10 text-pale-sky-500'
                            : res.success
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : 'bg-red-500/10 text-red-500'
                        }`}
                      >
                        {res.skipped
                          ? t('metricSkipped')
                          : res.success
                          ? t('metricImported')
                          : t('metricFailed')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 bg-canvas/80 border-t border-subtle flex items-center justify-between shrink-0">
          {step === 'select' && (
            <>
              <button
                type="button"
                onClick={handleModalClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-main hover:bg-canvas transition-colors cursor-pointer"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={stagedFiles.length === 0}
                onClick={handleScanDuplicates}
                className="px-5 py-2.5 rounded-2xl bg-pale-sky-500 text-white text-xs font-bold hover:bg-pale-sky-600 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-pale-sky-500/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>{t('scanDuplicatesBtn')}</span>
                <ForwardArrow className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'duplicates' && (
            <>
              <button
                type="button"
                disabled={isScanningDuplicates}
                onClick={() => setStep('select')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted hover:text-main hover:bg-canvas transition-colors flex items-center gap-2 cursor-pointer"
              >
                <BackArrow className="w-4 h-4" />
                <span>الرجوع للملفات</span>
              </button>

              <button
                type="button"
                disabled={isScanningDuplicates}
                onClick={handleStartImport}
                className="px-6 py-2.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>{t('startImportBtn')}</span>
                <ForwardArrow className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 'importing' && (
            <div className="w-full flex justify-end">
              <span className="text-xs text-muted font-medium animate-pulse">
                يرجى الانتظار، جاري الفهرسة والأرشفة...
              </span>
            </div>
          )}

          {step === 'summary' && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={handleModalClose}
                className="px-6 py-2.5 rounded-2xl bg-pale-sky-500 text-white text-xs font-bold hover:bg-pale-sky-600 shadow-md shadow-pale-sky-500/20 transition-all cursor-pointer"
              >
                {t('finishAndExploreBtn')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
