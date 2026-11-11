/**
 * Baglib — Synchronized Read-Along Lyrics / Karaoke Overlay (KEY-145)
 */

'use client';

import React, { useEffect, useRef } from 'react';
import { X, Play, Volume2, Sparkles } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectDominantLanguage } from '../../../shared/utils/tts-language-segmenter';

interface TTSLyricsViewProps {
  aboveWorkstation?: boolean;
  isOpen: boolean;
  onClose: () => void;
  sentences: string[];
  currentSentenceIndex: number;
  activeWord?: string;
  onSelectSentence: (index: number) => void;
  isPlaying: boolean;
}

export const TTSLyricsView: React.FC<TTSLyricsViewProps> = ({
  aboveWorkstation = false,
  isOpen,
  onClose,
  sentences,
  currentSentenceIndex,
  activeWord,
  onSelectSentence,
  isPlaying,
}) => {
  const { t } = useWorkspace();
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll active line into view smoothly
  useEffect(() => {
    if (isOpen && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentSentenceIndex, isOpen]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${aboveWorkstation ? 'z-[110]' : 'z-40'} bg-background/80 backdrop-blur-xl flex flex-col animate-in fade-in duration-200`}>
      {/* Header Bar */}
      <div className="h-16 border-b border-subtle px-6 flex items-center justify-between shrink-0 bg-surface/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-pale-sky-500/15 flex items-center justify-center text-pale-sky-600 dark:text-pale-sky-400">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-main">{t('ttsKaraokeLyrics')}</h3>
            <p className="text-xs text-muted">
              {t('ttsSentence')} {currentSentenceIndex + 1} / {sentences.length}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-canvas text-muted hover:text-main border border-subtle transition-colors cursor-pointer"
         aria-label={t('close')}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Synchronized Lyrics Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 sm:px-12 py-16 space-y-6 flex flex-col items-center justify-start text-center scroll-smooth"
      >
        {sentences.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted gap-2">
            <Sparkles className="w-8 h-8 opacity-40" />
            <span className="text-xs">{t('ttsNoLyricsText')}</span>
          </div>
        ) : (
          sentences.map((sentence, idx) => {
            const isActive = idx === currentSentenceIndex;
            const lang = detectDominantLanguage(sentence);
            const isRtl = lang === 'ar';

            return (
              <div
                key={idx}
                ref={isActive ? activeLineRef : null}
                onClick={() => onSelectSentence(idx)}
                dir={isRtl ? 'rtl' : 'ltr'}
                className={`w-full max-w-2xl px-6 py-4 rounded-2xl cursor-pointer transition-all duration-300 text-lg sm:text-2xl font-serif leading-relaxed ${
                  isActive
                    ? 'scale-105 bg-pale-sky-500/10 border border-pale-sky-500/30 text-pale-sky-600 dark:text-pale-sky-300 font-bold shadow-lg shadow-pale-sky-500/5'
                    : 'text-muted/60 hover:text-main hover:bg-surface/40 hover:scale-102'
                }`}
              >
                {isActive && activeWord ? (
                  /* Word-level active highlight within current sentence */
                  <span>
                    {sentence.split(new RegExp(`(${activeWord})`, 'gi')).map((chunk, cIdx) => (
                      <span
                        key={cIdx}
                        className={
                          chunk.toLowerCase() === activeWord.toLowerCase()
                            ? 'bg-pale-sky-500/30 text-pale-sky-700 dark:text-pale-sky-200 px-1 rounded-md'
                            : ''
                        }
                      >
                        {chunk}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span>{sentence}</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
