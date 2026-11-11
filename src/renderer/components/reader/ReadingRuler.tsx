import { useWorkspace } from '../context/WorkspaceContext';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { RulerLineBox } from '../../libs/reader/types';
import {
  buildLineBoxes,
  snapReadingRulerToLines,
  ClientRectLike,
} from '../../libs/reader/reading-ruler';
import { X, Minus, Plus } from 'lucide-react';

interface ReadingRulerProps {
  containerRef: React.RefObject<HTMLElement | null>;
  isActive: boolean;
  onClose: () => void;
  direction?: 'rtl' | 'ltr';
  isVertical?: boolean;
}

export const ReadingRuler: React.FC<ReadingRulerProps> = ({
  containerRef,
  isActive,
  onClose,
  direction = 'ltr',
  isVertical = false,
}) => {
  const { t } = useWorkspace();
  const [lineBoxes, setLineBoxes] = useState<RulerLineBox[]>([]);
  const [rulerHeight, setRulerHeight] = useState(38);
  const [slot, setSlot] = useState<{ start: number; height: number }>({ start: 100, height: 38 });
  const [opacity, setOpacity] = useState(0.5);

  // Measure visible line boxes from container elements
  const measureLineBoxes = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const cRect = container.getBoundingClientRect();
    const rects: ClientRectLike[] = [];

    // Check if there is an iframe inside (e.g. EPUB foliate frame)
    const iframes = container.querySelectorAll('iframe');
    if (iframes.length > 0) {
      iframes.forEach((iframe) => {
        try {
          const doc = iframe.contentDocument;
          if (doc && doc.body) {
            const frameRect = iframe.getBoundingClientRect();
            const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
              if (node.textContent && node.textContent.trim().length > 0) {
                const range = doc.createRange();
                range.selectNodeContents(node);
                const clientRects = range.getClientRects();
                for (let i = 0; i < clientRects.length; i++) {
                  const r = clientRects[i];
                  rects.push({
                    top: r.top + frameRect.top,
                    bottom: r.bottom + frameRect.top,
                    left: r.left + frameRect.left,
                    right: r.right + frameRect.left,
                    width: r.width,
                    height: r.height,
                  });
                }
              }
            }
          }
        } catch {
          // Cross-origin or sandboxed fallback
        }
      });
    } else {
      // Direct text nodes in container
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.textContent && node.textContent.trim().length > 0) {
          const range = document.createRange();
          range.selectNodeContents(node);
          const clientRects = range.getClientRects();
          for (let i = 0; i < clientRects.length; i++) {
            const r = clientRects[i];
            rects.push({
              top: r.top,
              bottom: r.bottom,
              left: r.left,
              right: r.right,
              width: r.width,
              height: r.height,
            });
          }
        }
      }
    }

    const boxes = buildLineBoxes(rects, isVertical, direction === 'rtl', {
      top: cRect.top,
      left: cRect.left,
      right: cRect.right,
      bottom: cRect.bottom,
    });

    setLineBoxes(boxes);
  }, [containerRef, direction, isVertical]);

  // Recalculate line boxes when ruler becomes active or container resizes
  useEffect(() => {
    if (!isActive) return;
    measureLineBoxes();

    const handleResize = () => measureLineBoxes();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isActive, measureLineBoxes]);

  // Mouse move tracking inside container
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const cRect = container.getBoundingClientRect();
      const targetPos = isVertical
        ? direction === 'rtl'
          ? cRect.right - e.clientX
          : e.clientX - cRect.left
        : e.clientY - cRect.top;

      const snapped = snapReadingRulerToLines(lineBoxes, targetPos, rulerHeight);
      setSlot({ start: snapped.slotStart, height: snapped.slotHeight });
    },
    [containerRef, direction, isVertical, lineBoxes, rulerHeight]
  );

  useEffect(() => {
    if (!isActive) return;
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('mousemove', handleMouseMove);
    return () => container.removeEventListener('mousemove', handleMouseMove);
  }, [isActive, handleMouseMove]);

  // Keyboard navigation for line stepping
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? rulerHeight : -rulerHeight;
        setSlot((prev) => {
          const nextTarget = Math.max(0, prev.start + prev.height / 2 + delta);
          const snapped = snapReadingRulerToLines(lineBoxes, nextTarget, rulerHeight);
          return { start: snapped.slotStart, height: snapped.slotHeight };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, lineBoxes, rulerHeight, onClose]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none select-none overflow-hidden">
      {/* Top Dimmed Mask */}
      <div
        className="absolute inset-x-0 top-0 transition-[height] duration-75 ease-out backdrop-blur-[0.5px]"
        style={{
          height: `${Math.max(0, slot.start)}px`,
          backgroundColor: `rgba(0, 0, 0, ${opacity})`,
        }}
      />

      {/* Transparent Focused Reading Slot with Outline */}
      <div
        className="absolute inset-x-0 transition-[top,height] duration-75 ease-out border-y-2 border-pale-sky-400/60 shadow-[0_0_12px_rgba(56,189,248,0.25)] flex items-center justify-end px-4 pointer-events-auto"
        style={{
          top: `${slot.start}px`,
          height: `${slot.height}px`,
        }}
      >
        {/* Floating Mini Controls */}
        <div className="flex items-center gap-1.5 bg-surface/90 backdrop-blur-md px-2 py-0.5 rounded-full border border-subtle shadow-md opacity-40 hover:opacity-100 transition-opacity">
          <button
            onClick={() => setRulerHeight((h) => Math.max(24, h - 6))}
            title={t('rulerNarrow')}
            className="p-0.5 rounded hover:bg-canvas text-muted hover:text-main cursor-pointer"
           aria-label={t('rulerNarrow')}>
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[10px] font-mono text-muted">{rulerHeight}px</span>
          <button
            onClick={() => setRulerHeight((h) => Math.min(96, h + 6))}
            title={t('rulerExpand')}
            className="p-0.5 rounded hover:bg-canvas text-muted hover:text-main cursor-pointer"
           aria-label={t('rulerExpand')}>
            <Plus className="w-3 h-3" />
          </button>
          <div className="w-[1px] h-3 bg-subtle mx-0.5" />
          <button
            onClick={onClose}
            title={t('rulerClose')}
            className="p-0.5 rounded hover:bg-rose-500/10 text-muted hover:text-rose-500 cursor-pointer"
           aria-label={t('rulerClose')}>
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Bottom Dimmed Mask */}
      <div
        className="absolute inset-x-0 bottom-0 transition-[top] duration-75 ease-out backdrop-blur-[0.5px]"
        style={{
          top: `${slot.start + slot.height}px`,
          backgroundColor: `rgba(0, 0, 0, ${opacity})`,
        }}
      />
    </div>
  );
};
