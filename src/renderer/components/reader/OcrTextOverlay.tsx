'use client';

import React, { useMemo } from 'react';
import { OcrPageResult, OcrLine, OcrWord } from '../../../shared/types/ocr';
import { calculateOcrWordPercentBox } from '../../../shared/utils/ocr-cleaner';

interface OcrTextOverlayProps {
  pageResult: OcrPageResult | null;
  pageWidth?: number;
  pageHeight?: number;
  showVisualDebug?: boolean;
  onWordClick?: (word: OcrWord) => void;
  className?: string;
}

export const OcrTextOverlay: React.FC<OcrTextOverlayProps> = ({
  pageResult,
  pageWidth,
  pageHeight,
  showVisualDebug = false,
  onWordClick,
  className = '',
}) => {
  if (!pageResult || (!pageResult.lines?.length && !pageResult.words?.length)) {
    return null;
  }

  const effectiveWidth = pageWidth || pageResult.width || 800;
  const effectiveHeight = pageHeight || pageResult.height || 1100;

  // Words list with calculated percent boxes
  const renderedWords = useMemo(() => {
    const list: Array<{ word: OcrWord; box: { left: string; top: string; width: string; height: string } }> = [];

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

  return (
    <div
      className={`ocr-text-overlay absolute inset-0 select-text overflow-hidden pointer-events-auto leading-none ${className}`}
      style={{
        zIndex: 15,
        mixBlendMode: showVisualDebug ? 'multiply' : 'normal',
      }}
      aria-label="OCR Selectable Text Layer"
    >
      {renderedWords.map(({ word, box }, index) => (
        <span
          key={`ocr-word-${index}`}
          className={`ocr-word-node absolute cursor-text select-text transition-colors duration-150 inline-block ${
            showVisualDebug
              ? 'bg-amber-300/25 border border-amber-500/30 text-amber-950 font-mono text-[10px]'
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
          title={showVisualDebug ? word.text : undefined}
          onClick={e => {
            if (onWordClick) {
              e.stopPropagation();
              onWordClick(word);
            }
          }}
        >
          {word.text}
        </span>
      ))}
    </div>
  );
};
