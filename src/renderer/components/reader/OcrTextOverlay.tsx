'use client';

import React, { useMemo } from 'react';
import type { OcrPageResult, OcrWord } from '../../../shared/types/ocr';
import { calculateOcrWordPercentBox } from '../../../shared/utils/ocr-cleaner';

interface OcrTextOverlayProps {
  pageResult: OcrPageResult | null;
  pageWidth?: number;
  pageHeight?: number;
  showVisualDebug?: boolean;
  activeWordIndex?: number | null;
  onWordClick?: (word: OcrWord, index: number) => void;
  className?: string;
}

export const OcrTextOverlay: React.FC<OcrTextOverlayProps> = ({
  pageResult,
  pageWidth,
  pageHeight,
  showVisualDebug = false,
  activeWordIndex = null,
  onWordClick,
  className = '',
}) => {
  const effectiveWidth = pageWidth || pageResult?.width || 800;
  const effectiveHeight = pageHeight || pageResult?.height || 1100;

  // Words list with calculated percent boxes
  const renderedWords = useMemo(() => {
    const list: Array<{ word: OcrWord; box: { left: string; top: string; width: string; height: string } }> = [];

    if (!pageResult) return list;

    // If lines with words exist, use them
    if (pageResult.lines && pageResult.lines.length > 0) {
      for (const line of pageResult.lines) {
        if (line.words && line.words.length > 0) {
          for (const w of line.words) {
            list.push({
              word: w,
              box: calculateOcrWordPercentBox(w.bbox, effectiveWidth, effectiveHeight),
            });
          }
        } else {
          // Line without words array
          list.push({
            word: { text: line.text, bbox: line.bbox },
            box: calculateOcrWordPercentBox(line.bbox, effectiveWidth, effectiveHeight),
          });
        }
      }
    } else if (pageResult.words && pageResult.words.length > 0) {
      for (const w of pageResult.words) {
        list.push({
          word: w,
          box: calculateOcrWordPercentBox(w.bbox, effectiveWidth, effectiveHeight),
        });
      }
    }

    return list;
  }, [pageResult, effectiveWidth, effectiveHeight]);

  if (!pageResult || (!pageResult.lines?.length && !pageResult.words?.length)) return null;

  return (
    <div
      className={`ocr-text-overlay absolute inset-0 select-text overflow-hidden pointer-events-auto leading-none ${className}`}
      style={{
        zIndex: 15,
      }}
      aria-label="OCR Selectable Text Layer"
    >
      {renderedWords.map(({ word, box }, index) => {
        const isActive = activeWordIndex === index;
        const confidenceText = word.confidence !== undefined ? ` (${(word.confidence * 100).toFixed(0)}%)` : '';

        return (
          <span
            key={`ocr-word-${index}`}
            data-ocr-word-index={index}
            data-ocr-active={isActive ? 'true' : undefined}
            className={`ocr-word-node absolute cursor-pointer select-text transition-all duration-150 inline-block rounded-xs ${
              isActive
                ? 'bg-amber-400/45 border-2 border-amber-500 shadow-lg ring-2 ring-amber-400/60 z-30 text-amber-950 dark:text-amber-100 font-mono text-[10px]'
                : showVisualDebug
                ? 'bg-sky-400/15 hover:bg-sky-400/35 border border-sky-500/40 text-transparent hover:text-sky-950 dark:hover:text-sky-100 font-mono text-[9px] hover:z-20'
                : 'text-transparent hover:bg-blue-400/10'
            }`}
            style={{
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              fontSize: `calc(${box.height} * 0.85)`,
              lineHeight: box.height,
            }}
            title={showVisualDebug ? `${word.text}${confidenceText}` : undefined}
            onClick={e => {
              if (onWordClick) {
                e.stopPropagation();
                onWordClick(word, index);
              }
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
};
