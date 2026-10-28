import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut, Eye } from 'lucide-react';
import { transformClassicalGlosses } from '../../libs/reader/typography';
import type { ReaderTheme } from '../../libs/reader/types';

interface ParagraphOverlayProps {
  paragraphs: string[];
  initialIndex?: number;
  direction?: 'rtl' | 'ltr';
  theme?: ReaderTheme;
  onClose: () => void;
  onParagraphChange?: (index: number) => void;
}

export const ParagraphOverlay: React.FC<ParagraphOverlayProps> = ({
  paragraphs,
  initialIndex = 0,
  direction = 'ltr',
  theme = 'light',
  onClose,
  onParagraphChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(paragraphs.length - 1, initialIndex))
  );
  const [scale, setScale] = useState(1.25);
  const textRef = useRef<HTMLDivElement>(null);

  // Sync index if initial changes
  const [previousResetInputs1, setPreviousResetInputs1] = useState<readonly unknown[] | null>(null);
  const resetInputs1 = [initialIndex, paragraphs.length];
  if (previousResetInputs1 === null || resetInputs1.some((value, index) => !Object.is(value, previousResetInputs1[index]))) {
    setPreviousResetInputs1(resetInputs1);

    setCurrentIndex(Math.max(0, Math.min(paragraphs.length - 1, initialIndex)));

  }

  const activeText = paragraphs[currentIndex] || '';

  // Process text through classical commentary glosses
  const renderedHtml = useMemo(() => {
    return transformClassicalGlosses(activeText);
  }, [activeText]);

  // CSS Custom Highlight API Registration for flicker-free sentence tracking
  useEffect(() => {
    if (typeof window === 'undefined' || typeof (window).CSS === 'undefined') return;
    const CSSAPI = (window).CSS;
    if (!('highlights' in CSSAPI) || typeof (window).Highlight !== 'function') return;

    const el = textRef.current;
    if (!el) return;

    try {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      if (textNode && textNode.textContent && textNode.textContent.trim().length > 0) {
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, Math.min(textNode.textContent.length, 120));
        const highlight = new (window).Highlight(range);
        CSSAPI.highlights.set('baglib-paragraph-focus', highlight);
      }
    } catch {
      // Ignore if highlight API fails in testing environment
    }

    return () => {
      try {
        if ('highlights' in CSSAPI) {
          CSSAPI.highlights.delete('baglib-paragraph-focus');
        }
      } catch {}
    };
  }, [currentIndex, renderedHtml]);

  // Keyboard controls: ArrowLeft, ArrowRight, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (direction === 'rtl') {
          handlePrev();
        } else {
          handleNext();
        }
      } else if (e.key === 'ArrowLeft') {
        if (direction === 'rtl') {
          handleNext();
        } else {
          handlePrev();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, paragraphs.length, direction, onClose]);

  function handleNext() {
    if (currentIndex < paragraphs.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      onParagraphChange?.(next);
    }
  }

  function handlePrev() {
    if (currentIndex > 0) {
      const prev = currentIndex - 1;
      setCurrentIndex(prev);
      onParagraphChange?.(prev);
    }
  }

  const themeClasses: Record<ReaderTheme, string> = {
    paper: 'bg-[#fcfaf2] text-[#2b2b2b] shadow-2xl border border-[#e8e4d9]',
    sepia: 'bg-[#fbf0d9] text-[#5f4b32] shadow-2xl border border-[#e6d5b8]',
    dusk: 'bg-[#2d2a32] text-[#e0dede] shadow-2xl border border-[#3f3b47]',
    midnight: 'bg-[#0f172a] text-[#e2e8f0] shadow-2xl border border-[#1e293b]',
    light: 'bg-white text-slate-800 shadow-2xl border border-slate-200',
    dark: 'bg-slate-900 text-slate-100 shadow-2xl border border-slate-700',
    night: 'bg-black text-neutral-200 shadow-2xl border border-neutral-800',
    'e-ink': 'bg-white text-black shadow-2xl border-2 border-black',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <style>{`
        ::highlight(baglib-paragraph-focus) {
          background-color: rgba(56, 189, 248, 0.25);
          color: inherit;
        }
      `}</style>

      {/* Main Focus Card */}
      <div
        className={`w-full max-w-3xl max-h-[85vh] rounded-3xl flex flex-col overflow-hidden transition-all duration-300 ${
          themeClasses[theme] || themeClasses.light
        }`}
        style={{ direction }}
      >
        {/* Top Header Bar */}
        <div className="p-4 border-b border-subtle/30 flex items-center justify-between text-xs font-bold text-muted bg-surface/30">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-pale-sky-500" />
            <span>
              {currentIndex + 1} / {paragraphs.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-surface/50 rounded-full px-2 py-0.5 border border-subtle/40">
              <button
                onClick={() => setScale((s) => Math.max(0.9, s - 0.15))}
                title="Zoom out"
                className="p-1 rounded-full hover:bg-canvas text-muted hover:text-main cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono">{Math.round(scale * 100)}%</span>
              <button
                onClick={() => setScale((s) => Math.min(2.5, s + 0.15))}
                title="Zoom in"
                className="p-1 rounded-full hover:bg-canvas text-muted hover:text-main cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              title="Close focus mode (Esc)"
              className="p-1.5 rounded-full hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Focused Content */}
        <div className="flex-1 overflow-y-auto p-8 flex items-center justify-center">
          <div
            ref={textRef}
            className="w-full font-serif leading-relaxed text-justify select-text outline-none transition-transform duration-200"
            style={{
              fontSize: `${scale * 1.25}rem`,
              lineHeight: direction === 'rtl' ? 2.1 : 1.85,
              wordSpacing: direction === 'rtl' ? '0.08em' : 'normal',
              fontFamily:
                direction === 'rtl'
                  ? "'Scheherazade New', 'Amiri', 'Traditional Arabic', serif"
                  : 'Georgia, Cambria, serif',
            }}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>

        {/* Bottom Navigation Bar */}
        <div className="p-4 border-t border-subtle/30 flex items-center justify-between bg-surface/20">
          <button
            onClick={direction === 'rtl' ? handleNext : handlePrev}
            disabled={direction === 'rtl' ? currentIndex >= paragraphs.length - 1 : currentIndex === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface hover:bg-canvas border border-subtle text-xs font-bold disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{direction === 'rtl' ? 'الفقرة التالية' : 'Previous'}</span>
          </button>

          <div className="text-[11px] text-muted font-sans">
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-subtle text-[10px]">←</kbd>
            {' '}/{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-surface border border-subtle text-[10px]">→</kbd>
            {' '}{direction === 'rtl' ? 'للتنقل بين الفقرات' : 'to navigate'}
          </div>

          <button
            onClick={direction === 'rtl' ? handlePrev : handleNext}
            disabled={direction === 'rtl' ? currentIndex === 0 : currentIndex >= paragraphs.length - 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface hover:bg-canvas border border-subtle text-xs font-bold disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
          >
            <span>{direction === 'rtl' ? 'الفقرة السابقة' : 'Next'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
