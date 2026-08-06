'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  BookOpen,
  FileText,
  Plus,
  Trash2,
  X,
  FileCode,
  Eye,
  Loader2,
  Highlighter,
  MessageSquare,
  Columns2,
  Rows2,
  Maximize2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  AlertCircle,
  Hash
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export const FullPageBookReader: React.FC = () => {
  const {
    activeBook,
    readingPage,
    setReadingPage,
    closeReaderToLibrary,
    splitOrientation,
    setSplitOrientation,
    bookNotes,
    addPageNote,
    deletePageNote,
    addHighlight,
  } = useWorkspace();

  const [selectedText, setSelectedText] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [filterMode, setFilterMode] = useState<'current_page' | 'all_pages'>('current_page');
  const [viewType, setViewType] = useState<'text_manuscript' | 'native_pdf'>('text_manuscript');
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  // Extracted PDF Text State
  const [extractedFullText, setExtractedFullText] = useState<string>('');
  const [extractedPages, setExtractedPages] = useState<string[]>([]);
  const [isExtractingText, setIsExtractingText] = useState<boolean>(false);
  const [extractionFailed, setExtractionFailed] = useState<boolean>(false);
  const [scannedInfo, setScannedInfo] = useState<{ numPages: number; totalChars: number } | null>(null);

  // Editable Page Target for Scanned PDFs & Manual Note Taking
  const [noteTargetPage, setNoteTargetPage] = useState<number>(readingPage);

  // Maximum valid pages calculation
  const maxBookPages = Math.max(
    1,
    scannedInfo?.numPages || (extractedPages.length > 0 ? extractedPages.length : activeBook?.pagesCount || 1)
  );

  // Sync noteTargetPage with readingPage when user navigates
  useEffect(() => {
    setNoteTargetPage(Math.min(maxBookPages, Math.max(1, readingPage)));
  }, [readingPage, maxBookPages]);

  // Load PDF Blob & Extract Real Text via Electron IPC
  useEffect(() => {
    let activeObjectUrl: string | null = null;

    const loadAndExtractPdf = async () => {
      if (!activeBook?.filePath) {
        setPdfBlobUrl(null);
        setExtractedFullText('');
        setExtractedPages([]);
        setExtractionFailed(false);
        setScannedInfo(null);
        return;
      }

      setIsLoadingPdf(true);
      setIsExtractingText(true);
      setExtractionFailed(false);
      setScannedInfo(null);
      const windowAPI = (window as any).electronAPI;

      // 1. Read Base64 for Native PDF View
      if (windowAPI?.readPdfBase64) {
        try {
          const base64Data: string | null = await windowAPI.readPdfBase64(activeBook.filePath);
          if (base64Data) {
            const binary = atob(base64Data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/pdf' });
            activeObjectUrl = URL.createObjectURL(blob);
            setPdfBlobUrl(activeObjectUrl);
          } else {
            setPdfBlobUrl(`local-pdf://${encodeURIComponent(activeBook.filePath)}`);
          }
        } catch (e) {
          console.warn('IPC PDF loading fallback:', e);
          setPdfBlobUrl(`local-pdf://${encodeURIComponent(activeBook.filePath)}`);
        }
      } else {
        setPdfBlobUrl(`local-pdf://${encodeURIComponent(activeBook.filePath)}`);
      }
      setIsLoadingPdf(false);

      // 2. Extract Real Text for Blended Text & Highlighting View
      if (windowAPI?.extractPdfText) {
        try {
          const result = await windowAPI.extractPdfText(activeBook.filePath);
          
          if (result && result.isScannedImagePdf) {
            setExtractionFailed(true);
            setScannedInfo({ numPages: result.numpages || 1, totalChars: result.totalChars || 0 });
            setViewType('native_pdf');
          } else if (result && result.text && result.text.trim().length > 20) {
            const fullText = result.text;
            setExtractedFullText(fullText);

            let rawPages = fullText.split(/---PAGE_SPLIT_MARKER---||\f/);
            rawPages = rawPages.map((p: string) => p.trim()).filter((p: string) => p.length > 0);

            if (rawPages.length === 0) {
              const chunkSize = 1200;
              rawPages = [];
              for (let i = 0; i < fullText.length; i += chunkSize) {
                rawPages.push(fullText.substring(i, i + chunkSize));
              }
            }
            setExtractedPages(rawPages);
            if (result.numpages) {
              setScannedInfo({ numPages: result.numpages, totalChars: fullText.length });
            }
          } else {
            setExtractionFailed(true);
            if (result && result.numpages) {
              setScannedInfo({ numPages: result.numpages, totalChars: result.totalChars || 0 });
            }
          }
        } catch (err) {
          console.warn('PDF text extraction error:', err);
          setExtractionFailed(true);
        }
      } else {
        setExtractionFailed(true);
      }
      setIsExtractingText(false);
    };

    loadAndExtractPdf();

    return () => {
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
      }
    };
  }, [activeBook?.filePath]);

  if (!activeBook) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-canvas text-main font-sans text-center space-y-4" dir="rtl">
        <div className="w-16 h-16 rounded-3xl bg-surface border border-subtle flex items-center justify-center text-muted">
          <BookOpen className="w-8 h-8 text-pale-sky-500" />
        </div>
        <div className="space-y-1">
          <h2 className="font-bold text-lg text-main font-display">لم يتم تحديد أي كتاب للقراءة</h2>
          <p className="text-xs text-muted max-w-sm">اختر كتاباً من مكتبتك الخاصة للبدء في قراءته وتدوين الملاحظات.</p>
        </div>
        <button
          onClick={closeReaderToLibrary}
          className="px-4 py-2 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-md transition-all cursor-pointer"
        >
          الانتقال إلى المكتبة
        </button>
      </div>
    );
  }

  // Active Page Text Content
  const activePageText = extractedPages[readingPage - 1] || extractedFullText;

  // Filter Notes
  const currentPageNotes = bookNotes.filter((n) => n.pageNumber === noteTargetPage);
  const displayedNotes = filterMode === 'current_page' ? currentPageNotes : bookNotes;

  // Handle Text Selection in Manuscript View
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString().trim());
    }
  };

  const handleApplyHighlight = (colorClass = 'bg-amber-500/30') => {
    if (!selectedText) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));
    addHighlight(safePage, selectedText, colorClass);
    addPageNote({
      pageNumber: safePage,
      highlightedText: selectedText,
      content: `تظليل نص: "${selectedText}"`,
    });
    setSelectedText('');
  };

  const handleCreateNoteFromSelection = () => {
    if (!selectedText) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));
    addPageNote({
      pageNumber: safePage,
      highlightedText: selectedText,
      content: `تعليق على النص: "${selectedText}"`,
    });
    setSelectedText('');
  };

  const handleAddManualNote = () => {
    if (!newNoteText.trim()) return;
    const safePage = Math.min(maxBookPages, Math.max(1, noteTargetPage));
    addPageNote({
      pageNumber: safePage,
      highlightedText: selectedText || undefined,
      content: newNoteText,
    });
    setNewNoteText('');
    setSelectedText('');
  };

  // Render Split Notes Panel
  const renderNotesPanel = () => (
    <aside
      className={`bg-surface border-subtle flex flex-col z-10 shrink-0 font-sans ${
        splitOrientation === 'vertical'
          ? 'w-80 sm:w-96 border-r'
          : splitOrientation === 'horizontal'
          ? 'h-64 sm:h-72 border-t'
          : 'flex-1 border-none'
      }`}
    >
      {/* Notes Header */}
      <div className="p-3.5 border-b border-subtle flex items-center justify-between bg-canvas/40">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-pale-sky-500" />
          <h3 className="font-bold text-main text-xs">ملاحظات «{activeBook.title}»</h3>
        </div>
        <button
          onClick={() => setSplitOrientation('none')}
          className="p-1 rounded-lg hover:bg-canvas text-muted hover:text-main cursor-pointer"
          title="إغلاق لوحة الملاحظات"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filter Selector */}
      <div className="p-2 border-b border-subtle flex items-center gap-1 bg-canvas/20 text-xs">
        <button
          onClick={() => setFilterMode('current_page')}
          className={`flex-1 py-1 rounded-lg font-bold transition-all cursor-pointer ${
            filterMode === 'current_page'
              ? 'bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 border border-pale-sky-500/30'
              : 'text-muted hover:text-main'
          }`}
        >
          الصفحة {noteTargetPage} ({currentPageNotes.length})
        </button>
        <button
          onClick={() => setFilterMode('all_pages')}
          className={`flex-1 py-1 rounded-lg font-bold transition-all cursor-pointer ${
            filterMode === 'all_pages'
              ? 'bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 border border-pale-sky-500/30'
              : 'text-muted hover:text-main'
          }`}
        >
          كل الملاحظات ({bookNotes.length})
        </button>
      </div>

      {/* New Note Creator Box with Page Control for Scanned PDFs */}
      <div className="p-3 border-b border-subtle space-y-2.5 bg-canvas/30">
        {selectedText && (
          <div className="p-2 rounded-xl bg-pale-sky-500/10 border border-pale-sky-500/20 text-[11px] text-pale-sky-700 dark:text-pale-sky-300 font-serif">
            الاقتباس المحدد: "{selectedText}"
          </div>
        )}

        {/* Page Picker Selector Control */}
        <div className="flex items-center justify-between text-xs bg-surface p-1.5 rounded-xl border border-subtle">
          <span className="font-bold text-muted text-[11px] flex items-center gap-1">
            <Hash className="w-3.5 h-3.5 text-pale-sky-500" />
            رقم الصفحة (من 1 إلى {maxBookPages}):
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setNoteTargetPage(Math.max(1, noteTargetPage - 1))}
              disabled={noteTargetPage <= 1}
              className="w-6 h-6 rounded-lg bg-canvas border border-subtle flex items-center justify-center font-bold text-main hover:bg-surface cursor-pointer text-xs disabled:opacity-40"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={maxBookPages}
              value={noteTargetPage}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                if (isNaN(val)) {
                  setNoteTargetPage(1);
                } else {
                  setNoteTargetPage(Math.min(maxBookPages, Math.max(1, val)));
                }
              }}
              className="w-12 h-6 bg-canvas border border-subtle rounded-lg text-pale-sky-600 dark:text-pale-sky-300 font-bold text-center text-xs outline-none focus:border-pale-sky-500"
            />
            <button
              onClick={() => setNoteTargetPage(Math.min(maxBookPages, noteTargetPage + 1))}
              disabled={noteTargetPage >= maxBookPages}
              className="w-6 h-6 rounded-lg bg-canvas border border-subtle flex items-center justify-center font-bold text-main hover:bg-surface cursor-pointer text-xs disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>

        <textarea
          value={newNoteText}
          onChange={(e) => setNewNoteText(e.target.value)}
          placeholder={`أضف ملاحظتك على صفحة ${noteTargetPage}...`}
          className="w-full h-16 p-2.5 rounded-xl bg-surface border border-subtle text-main text-xs outline-none focus:border-pale-sky-500 font-sans resize-none"
        />

        <button
          onClick={handleAddManualNote}
          className="w-full py-2 rounded-xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>حفظ الملاحظة على صفحة {noteTargetPage}</span>
        </button>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {displayedNotes.length > 0 ? (
          displayedNotes.map((note) => (
            <div
              key={note.id}
              className="p-3 rounded-2xl bg-canvas border border-subtle space-y-2 group hover:border-pale-sky-500/40 transition-all"
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    const safePage = Math.min(maxBookPages, Math.max(1, note.pageNumber));
                    setReadingPage(safePage);
                    setNoteTargetPage(safePage);
                  }}
                  className="text-[10px] px-2.5 py-0.5 rounded-full bg-pale-sky-500/10 text-pale-sky-700 dark:text-pale-sky-300 font-bold border border-pale-sky-500/20 hover:bg-pale-sky-500/20 transition-all cursor-pointer flex items-center gap-1"
                >
                  <Hash className="w-3 h-3" />
                  <span>الصفحة {note.pageNumber}</span>
                </button>
                <button
                  onClick={() => deletePageNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 text-red-500 p-1 hover:bg-surface rounded transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {note.highlightedText && (
                <p className="text-[11px] text-muted font-serif italic border-r-2 border-pale-sky-500 pr-2">
                  "{note.highlightedText}"
                </p>
              )}

              <p className="text-xs text-main font-sans leading-relaxed">{note.content}</p>

              <span className="text-[10px] text-muted block pt-1 border-t border-subtle/40">
                {note.createdAt}
              </span>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-muted text-xs">
            لا توجد ملاحظات مدونة بعد على هذا الكتاب.
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-canvas text-main overflow-hidden font-sans select-none" dir="rtl">
      {/* Top Header Bar */}
      <header className="h-14 bg-surface border-b border-subtle flex items-center justify-between px-4 z-20 shrink-0 gap-2">
        {/* Left Actions: Back to Library */}
        <div className="flex items-center gap-3">
          <button
            onClick={closeReaderToLibrary}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle hover:bg-surface text-muted hover:text-main text-xs font-bold transition-all cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
            <span>العودة للمكتبة</span>
          </button>

          <div className="h-4 w-px bg-subtle hidden sm:block" />

          {/* Book Info Title */}
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-pale-sky-500 shrink-0" />
            <h2 className="font-bold text-main text-xs sm:text-sm truncate max-w-xs sm:max-w-md">
              {activeBook.title} - <span className="text-muted font-serif">{activeBook.author}</span>
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded bg-pale-sky-500/10 text-pale-sky-600 dark:text-pale-sky-300 font-mono font-bold">
              {activeBook.digitalFormat || 'PDF'}
            </span>
          </div>
        </div>

        {/* Center: Reader View Mode Switcher */}
        <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle text-xs">
          <button
            onClick={() => setViewType('text_manuscript')}
            className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewType === 'text_manuscript'
                ? 'bg-pale-sky-500 text-white shadow-sm'
                : 'text-muted hover:text-main'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>عرض النص والتظليل (ترافيقي)</span>
          </button>

          <button
            onClick={() => setViewType('native_pdf')}
            className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              viewType === 'native_pdf'
                ? 'bg-pale-sky-500 text-white shadow-sm'
                : 'text-muted hover:text-main'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>معاينة PDF الخام</span>
          </button>
        </div>

        {/* Right Layout Split Mode Switcher */}
        <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle text-xs">
          <button
            onClick={() => setSplitOrientation('none')}
            title="قارئ كامل (بدون ملاحظات)"
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              splitOrientation === 'none'
                ? 'bg-pale-sky-500 text-white shadow-sm'
                : 'text-muted hover:text-main'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">قارئ كامل</span>
          </button>

          <button
            onClick={() => setSplitOrientation('vertical')}
            title="انقسام عمودي (الكتاب بجانب الملاحظات)"
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              splitOrientation === 'vertical'
                ? 'bg-pale-sky-500 text-white shadow-sm'
                : 'text-muted hover:text-main'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">انقسام عمودي</span>
          </button>

          <button
            onClick={() => setSplitOrientation('horizontal')}
            title="انقسام أفقي (الكتاب فوق الملاحظات)"
            className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              splitOrientation === 'horizontal'
                ? 'bg-pale-sky-500 text-white shadow-sm'
                : 'text-muted hover:text-main'
            }`}
          >
            <Rows2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">انقسام أفقي</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div
        className={`flex-1 flex min-h-0 relative overflow-hidden ${
          splitOrientation === 'horizontal' ? 'flex-col' : 'flex-row'
        }`}
      >
        {splitOrientation !== 'full_notes' && (
          <div className="flex-1 overflow-hidden p-3 sm:p-4 flex justify-center bg-canvas/40 relative">
            {viewType === 'text_manuscript' ? (
              /* REAL TEXT MANUSCRIPT & HIGHLIGHTING READER */
              <div
                onMouseUp={handleMouseUp}
                className="w-full max-w-3xl flex flex-col bg-surface border border-subtle rounded-3xl p-6 sm:p-10 shadow-xl relative transition-all overflow-hidden"
              >
                {/* Header Page Controls */}
                <div className="flex items-center justify-between text-xs text-muted pb-3 border-b border-subtle/50 font-serif shrink-0">
                  <span>{activeBook.title} - {activeBook.author}</span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={readingPage <= 1}
                      onClick={() => setReadingPage(Math.max(1, readingPage - 1))}
                      className="p-1 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <span className="font-bold text-main font-sans">
                      صفحة {readingPage} من {maxBookPages}
                    </span>

                    <button
                      disabled={readingPage >= maxBookPages}
                      onClick={() => setReadingPage(Math.min(maxBookPages, readingPage + 1))}
                      className="p-1 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Floating Highlighting & Note Action Bar */}
                {selectedText && (
                  <div className="absolute top-16 right-1/2 translate-x-1/2 z-30 bg-main text-canvas p-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs animate-in fade-in zoom-in duration-150 border border-canvas/20">
                    <span className="font-bold truncate max-w-xs px-2 border-l border-canvas/20 font-serif">
                      "{selectedText}"
                    </span>

                    <button
                      onClick={() => handleApplyHighlight('bg-amber-500/30')}
                      className="px-2.5 py-1 rounded-xl bg-pale-sky-500 text-white font-bold hover:bg-pale-sky-600 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Highlighter className="w-3.5 h-3.5" />
                      <span>تظليل النص</span>
                    </button>

                    <button
                      onClick={handleCreateNoteFromSelection}
                      className="px-2.5 py-1 rounded-xl bg-evergreen-500 text-white font-bold hover:bg-evergreen-600 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>ربط بالملاحظات</span>
                    </button>

                    <button
                      onClick={() => setSelectedText('')}
                      className="p-1 hover:bg-canvas/20 rounded-lg text-canvas"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Manuscript Main Scrollable Content */}
                <div className="flex-1 overflow-y-auto py-6 space-y-6 select-text">
                  {isExtractingText ? (
                    <div className="h-64 flex flex-col items-center justify-center text-muted gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500" />
                      <span className="text-xs font-bold font-sans">جاري فحص واستخراج نص الكتاب...</span>
                    </div>
                  ) : extractionFailed || !activePageText ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 my-auto">
                      <div className="w-16 h-16 rounded-3xl bg-pale-sky-500/10 border border-pale-sky-500/20 flex items-center justify-center text-pale-sky-500">
                        <AlertCircle className="w-8 h-8" />
                      </div>
                      <div className="space-y-2 max-w-md">
                        <h3 className="font-bold text-base text-main font-display">تم اكتشاف كتاب مصور ضوئياً (Scanned PDF)</h3>
                        <p className="text-xs text-muted leading-relaxed font-sans">
                          تم فحص هذا الكتاب ({scannedInfo ? `${scannedInfo.numPages} صفحة` : 'الملف المحدد'}) وتبين أنه يتكون من صور صفحات ممسوخة ضوئياً مع علامات مائية فقط ({scannedInfo?.totalChars || 0} حرف إجمالي).
                        </p>
                        <p className="text-xs text-muted leading-relaxed font-sans">
                          تم توجيهك تلقائياً لمعاينة PDF الخام لقراءة كافة الصفحات بالكامل وتدوين الملاحظات.
                        </p>
                      </div>
                      <button
                        onClick={() => setViewType('native_pdf')}
                        className="px-5 py-2.5 rounded-2xl bg-pale-sky-500 text-white font-bold text-xs hover:bg-pale-sky-600 shadow-md transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <FileCode className="w-4 h-4" />
                        <span>الانتقال لمعاينة PDF الخام</span>
                      </button>
                    </div>
                  ) : (
                    <div className="font-serif text-base sm:text-lg text-main leading-loose space-y-4">
                      {activePageText.split('\n\n').map((paragraph, idx) => (
                        <p key={idx} className="indent-4 leading-relaxed">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                {/* Page Footer Navigation */}
                <div className="pt-4 border-t border-subtle/50 flex items-center justify-between text-xs text-muted font-serif shrink-0">
                  <span className="flex items-center gap-1 text-[11px] text-pale-sky-600 dark:text-pale-sky-300 font-sans">
                    <Sparkles className="w-3 h-3" />
                    حدد أي نص بالسحب للتظليل وإضافة ملاحظة
                  </span>
                  <span>- الصفحة {readingPage} -</span>
                </div>
              </div>
            ) : (
              /* NATIVE RAW PDF VIEW */
              <div className="w-full h-full bg-surface border border-subtle rounded-2xl overflow-hidden shadow-2xl relative flex flex-col">
                {isLoadingPdf ? (
                  <div className="w-full h-full bg-surface flex flex-col items-center justify-center text-muted gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-pale-sky-500" />
                    <span className="text-xs font-bold">جاري تحميل ملف PDF الأصلي...</span>
                  </div>
                ) : pdfBlobUrl ? (
                  <iframe
                    src={pdfBlobUrl}
                    title={activeBook.title}
                    className="w-full h-full border-none"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted text-xs p-6 space-y-3">
                    <FileText className="w-10 h-10 text-subtle" />
                    <p className="font-bold text-main">لم يتم العثور على مسار PDF محلي لهذا الكتاب.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Optional Split-Screen Notes Panel */}
        {splitOrientation !== 'none' && renderNotesPanel()}
      </div>
    </div>
  );
};
