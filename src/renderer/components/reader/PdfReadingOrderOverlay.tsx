'use client';

import React from 'react';
import type { PdfAccessibilityReadingOrderItem } from '../../../shared/types/pdf-accessibility';
import { useWorkspace } from '../context/WorkspaceContext';

interface PdfReadingOrderOverlayProps {
  pageNumber: number;
  items: PdfAccessibilityReadingOrderItem[];
  isTagged: boolean;
  pageWidth?: number;
  pageHeight?: number;
}

export function PdfReadingOrderOverlay({
  pageNumber,
  items,
  isTagged,
  pageWidth = 600,
  pageHeight = 800,
}: PdfReadingOrderOverlayProps) {
  const { t } = useWorkspace();
  const pageItems = items.filter(it => it.page === pageNumber);

  return (
    <div
      data-pdf-reading-order-overlay
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      aria-hidden="true"
    >
      {/* Top Banner Tag */}
      <div className="absolute top-2 start-2 rounded-full border border-emerald-500/40 bg-surface/90 backdrop-blur-xs px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-200 shadow-sm flex items-center gap-1.5">
        <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>
          {isTagged ? t('pdfA11yReadingOrderTagged') : t('pdfA11yReadingOrderEstimate')}
        </span>
      </div>

      {/* Numbered Badges over blocks */}
      {pageItems.map((item, idx) => {
        let style: React.CSSProperties = {};
        if (item.rect && item.rect.length === 4) {
          const [x0, y0, x1, y1] = item.rect;
          const leftPercent = Math.max(2, Math.min(95, (x0 / pageWidth) * 100));
          const topPercent = Math.max(2, Math.min(95, (y0 / pageHeight) * 100));
          const widthPercent = Math.max(5, Math.min(96, ((x1 - x0) / pageWidth) * 100));
          const heightPercent = Math.max(2, Math.min(50, ((y1 - y0) / pageHeight) * 100));

          style = {
            position: 'absolute',
            left: `${leftPercent}%`,
            top: `${topPercent}%`,
            width: `${widthPercent}%`,
            height: `${heightPercent}%`,
          };
        } else {
          // Distributed vertically down page if no exact bounding rect
          const topPercent = 8 + (idx * 9);
          style = {
            position: 'absolute',
            left: '4%',
            top: `${topPercent}%`,
          };
        }

        return (
          <div
            key={item.order}
            data-reading-order-badge={item.order}
            style={style}
            className="border border-emerald-500/50 bg-emerald-500/15 rounded-md pointer-events-none flex items-start justify-start p-0.5"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white font-mono text-[10px] font-bold shadow-xs">
              {item.order}
            </span>
          </div>
        );
      })}
    </div>
  );
}
