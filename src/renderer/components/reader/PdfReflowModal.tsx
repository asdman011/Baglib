'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Search,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  buildReflowParagraphs,
  selectTtsVoiceForParagraph,
  sanitizePdfExtractedText,
  type ReflowParagraph,
} from '../../../shared/pdf-accessibility-utils';

interface PdfReflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageText: string;
  docTitle?: string;
  defaultDirection?: 'rtl' | 'ltr';
  hasUnmappedGlyphs?: boolean;
}

export function PdfReflowModal({
  isOpen,
  onClose,
  currentPage,
  totalPages,
  onPageChange,
  pageText,
  docTitle,
  defaultDirection = 'ltr',
  hasUnmappedGlyphs = false,
}: PdfReflowModalProps) {
  const { t } = useWorkspace();
  const [fontSize, setFontSize] = useState<number>(18);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentParagraphIdx, setCurrentParagraphIdx] = useState(0);
  const [currentSentenceIdx, setCurrentSentenceIdx] = useState(0);
  const [noVoiceNotice, setNoVoiceNotice] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  const speakCurrentRef = useRef<(pIdx: number, sIdx: number) => void>(() => {});

  // Load browser speech synthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    synthRef.current = window.speechSynthesis;
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, []);

  // Sanitize the text (maps known PUA brackets like 0xF22B to ﴿, drops unmapped PUA characters)
  const { cleanText, hasUnmappedGlyphs: textHasUnmapped } = useMemo(() => {
    let text = pageText || '';
    if (!text && typeof document !== 'undefined') {
      const spans = Array.from(document.querySelectorAll('.textLayer span'))
        .map(s => s.textContent || '')
        .join(' ')
        .trim();
      if (spans) text = spans;
    }
    return sanitizePdfExtractedText(text);
  }, [pageText]);

  const showUnmappedNotice = Boolean(hasUnmappedGlyphs || textHasUnmapped);

  // Build reflow paragraphs for current page
  const paragraphs: ReflowParagraph[] = useMemo(() => {
    return buildReflowParagraphs(cleanText, defaultDirection);
  }, [cleanText, defaultDirection]);

  // Speech stopping helper
  const stopSpeech = useCallback(() => {
    synthRef.current?.cancel();
    setIsPlaying(false);
    setNoVoiceNotice(null);
  }, []);

  // Page change handler resets paragraph/sentence position and speech
  const handlePageChange = useCallback(
    (page: number) => {
      stopSpeech();
      setCurrentParagraphIdx(0);
      setCurrentSentenceIdx(0);
      onPageChange(page);
    },
    [stopSpeech, onPageChange]
  );

  // Close handler
  const handleClose = useCallback(() => {
    stopSpeech();
    onClose();
  }, [stopSpeech, onClose]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  // Read current sentence aloud
  const speakCurrent = useCallback(
    (pIdx: number, sIdx: number) => {
      if (!synthRef.current || !paragraphs[pIdx]) {
        setIsPlaying(false);
        return;
      }

      synthRef.current.cancel();
      const paragraph = paragraphs[pIdx];
      const sentence = paragraph.sentences[sIdx] || paragraph.text;

      // Select voice adhering strictly to the user decision:
      // If Arabic and no Arabic voice installed, show localized notice and stop cleanly without crashing.
      const voiceResult = selectTtsVoiceForParagraph(paragraph.text, voices);

      if (voiceResult.missingArabicNotice) {
        setNoVoiceNotice(t('pdfA11yNoArabicVoice'));
        setIsPlaying(false);
        return;
      }

      setNoVoiceNotice(null);
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = voiceResult.lang;
      if (voiceResult.voiceURI) {
        const found = voices.find(v => v.voiceURI === voiceResult.voiceURI);
        if (found) utterance.voice = found;
      }

      utterance.onend = () => {
        if (!isPlayingRef.current) return;
        // Advance sentence
        if (sIdx + 1 < paragraph.sentences.length) {
          setCurrentSentenceIdx(sIdx + 1);
          speakCurrentRef.current(pIdx, sIdx + 1);
        } else if (pIdx + 1 < paragraphs.length) {
          // Next paragraph
          setCurrentParagraphIdx(pIdx + 1);
          setCurrentSentenceIdx(0);
          speakCurrentRef.current(pIdx + 1, 0);
        } else if (currentPage < totalPages) {
          // Advance page
          handlePageChange(currentPage + 1);
        } else {
          setIsPlaying(false);
        }
      };

      utterance.onerror = () => {
        setIsPlaying(false);
      };

      synthRef.current.speak(utterance);
    },
    [paragraphs, voices, currentPage, totalPages, handlePageChange, t]
  );

  useEffect(() => {
    speakCurrentRef.current = speakCurrent;
  }, [speakCurrent]);

  const togglePlay = () => {
    if (isPlaying) {
      stopSpeech();
    } else {
      if (paragraphs.length === 0) {
        if (defaultDirection === 'rtl') {
          const voiceResult = selectTtsVoiceForParagraph('نص تجريبي عربي', voices);
          if (voiceResult.missingArabicNotice) {
            setNoVoiceNotice(t('pdfA11yNoArabicVoice'));
            return;
          }
        }
        return;
      }
      setIsPlaying(true);
      speakCurrent(currentParagraphIdx, currentSentenceIdx);
    }
  };

  const handlePrevSentence = () => {
    if (currentSentenceIdx > 0) {
      const nextS = currentSentenceIdx - 1;
      setCurrentSentenceIdx(nextS);
      if (isPlaying) speakCurrent(currentParagraphIdx, nextS);
    } else if (currentParagraphIdx > 0) {
      const nextP = currentParagraphIdx - 1;
      const prevParaSentences = paragraphs[nextP].sentences.length;
      const nextS = Math.max(0, prevParaSentences - 1);
      setCurrentParagraphIdx(nextP);
      setCurrentSentenceIdx(nextS);
      if (isPlaying) speakCurrent(nextP, nextS);
    }
  };

  const handleNextSentence = () => {
    const currentPara = paragraphs[currentParagraphIdx];
    if (currentPara && currentSentenceIdx + 1 < currentPara.sentences.length) {
      const nextS = currentSentenceIdx + 1;
      setCurrentSentenceIdx(nextS);
      if (isPlaying) speakCurrent(currentParagraphIdx, nextS);
    } else if (currentParagraphIdx + 1 < paragraphs.length) {
      const nextP = currentParagraphIdx + 1;
      setCurrentParagraphIdx(nextP);
      setCurrentSentenceIdx(0);
      if (isPlaying) speakCurrent(nextP, 0);
    } else if (currentPage < totalPages) {
      onPageChange(currentPage + 1);
    }
  };

  // Keyboard navigation: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const needle = searchQuery.trim().toLocaleLowerCase();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('pdfA11yReflowTitle')}
      data-pdf-reflow-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="flex h-full max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-subtle bg-surface text-main shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-subtle px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2 min-w-0">
            <BookOpen size={18} className="text-emerald-500 shrink-0" aria-hidden="true" />
            <h2 className="text-xs sm:text-sm font-bold truncate">
              {docTitle || t('pdfA11yReflowTitle')}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Zoom Controls */}
            <button
              type="button"
              tabIndex={0}
              data-reflow-zoom-out
              aria-label={t('quranZoomOut')}
              title={t('quranZoomOut')}
              onClick={() => setFontSize(prev => Math.max(12, prev - 2))}
              className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-xs font-mono text-muted">{fontSize}px</span>
            <button
              type="button"
              tabIndex={0}
              data-reflow-zoom-in
              aria-label={t('quranZoomIn')}
              title={t('quranZoomIn')}
              onClick={() => setFontSize(prev => Math.min(32, prev + 2))}
              className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <ZoomIn size={16} />
            </button>

            <button
              type="button"
              tabIndex={0}
              data-reflow-close
              aria-label={t('close')}
              title={t('close')}
              onClick={handleClose}
              className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-main focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar: TTS Player, Search, Page Nav */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle/60 bg-canvas px-3 py-2 text-xs">
          {/* TTS Player Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              tabIndex={0}
              data-reflow-play
              aria-label={isPlaying ? t('ttsPauseBtn') : t('ttsPlayBtn')}
              title={isPlaying ? t('ttsPauseBtn') : t('ttsPlayBtn')}
              onClick={togglePlay}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              <span>{isPlaying ? t('ttsPauseBtn') : t('ttsPlayBtn')}</span>
            </button>

            <button
              type="button"
              tabIndex={0}
              data-reflow-prev-sentence
              aria-label={t('ttsPrevSentence')}
              title={t('ttsPrevSentence')}
              onClick={handlePrevSentence}
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-main focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <SkipBack size={15} />
            </button>

            <button
              type="button"
              tabIndex={0}
              data-reflow-next-sentence
              aria-label={t('ttsNextSentence')}
              title={t('ttsNextSentence')}
              onClick={handleNextSentence}
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-main focus-visible:outline-2 focus-visible:outline-emerald-500"
            >
              <SkipForward size={15} />
            </button>
          </div>

          {/* Search bar */}
          <label className="flex items-center gap-1.5 rounded-lg border border-subtle bg-surface px-2 py-1 text-xs focus-within:border-emerald-500">
            <Search size={13} className="text-muted" aria-hidden="true" />
            <input
              type="search"
              tabIndex={0}
              data-reflow-search
              dir="auto"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t('pdfA11ySearchPlaceholder')}
              className="w-28 sm:w-44 bg-transparent outline-none text-main placeholder:text-muted"
            />
          </label>

          {/* Page Navigation */}
          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              tabIndex={0}
              data-reflow-prev-page
              disabled={currentPage <= 1}
              onClick={() => handlePageChange(currentPage - 1)}
              className="rounded-lg p-1 text-muted hover:bg-surface hover:text-main disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-500 rtl:rotate-180"
              title={t('pdfNavPrevious')}
            >
              <ChevronLeft size={16} />
            </button>

            <span className="font-mono text-muted px-1">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              tabIndex={0}
              data-reflow-next-page
              disabled={currentPage >= totalPages}
              onClick={() => handlePageChange(currentPage + 1)}
              className="rounded-lg p-1 text-muted hover:bg-surface hover:text-main disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-500 rtl:rotate-180"
              title={t('pdfNavNext')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Notice for missing voice */}
        {noVoiceNotice && (
          <div
            role="alert"
            data-reflow-no-voice-notice
            className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <AlertCircle size={15} className="shrink-0 text-amber-600" />
            <span>{noVoiceNotice}</span>
          </div>
        )}

        {/* Notice for unmapped glyphs */}
        {showUnmappedNotice && (
          <div
            role="alert"
            data-reflow-unmapped-notice
            className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <AlertCircle size={15} className="shrink-0 text-amber-600" />
            <span>{t('pdfA11yUnmappedWarning')}</span>
          </div>
        )}

        {/* Reflowed Text Body */}
        <div
          data-reflow-content
          tabIndex={0}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-10 max-w-full overflow-x-hidden space-y-4 focus-visible:outline-none"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1.8 }}
        >
          {paragraphs.length === 0 ? (
            <p className="text-center text-muted py-12 text-sm">{t('pdfA11yNoTextOnPage')}</p>
          ) : (
            paragraphs.map((para, pIdx) => {
              if (needle && !para.text.toLocaleLowerCase().includes(needle)) {
                return null;
              }
              const isCurrentPara = isPlaying && currentParagraphIdx === pIdx;

              return (
                <p
                  key={para.id}
                  dir={para.direction}
                  data-reflow-paragraph={pIdx}
                  className={`break-words select-text rounded-lg p-1 transition-colors ${
                    para.direction === 'rtl' ? 'font-serif text-right' : 'text-left'
                  } ${isCurrentPara ? 'bg-emerald-500/5' : ''}`}
                >
                  {para.sentences.map((sent, sIdx) => {
                    const isCurrentSentence = isCurrentPara && currentSentenceIdx === sIdx;
                    return (
                      <span
                        key={sIdx}
                        data-reflow-sentence={`${pIdx}-${sIdx}`}
                        className={`transition-colors rounded px-0.5 ${
                          isCurrentSentence
                            ? 'bg-amber-400/35 text-amber-950 dark:bg-amber-500/30 dark:text-amber-100 font-medium'
                            : ''
                        }`}
                      >
                        {sent}{' '}
                      </span>
                    );
                  })}
                </p>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
