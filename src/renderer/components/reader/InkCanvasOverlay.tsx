'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  PenTool,
  Highlighter,
  Eraser,
  RotateCcw,
  RotateCw,
  Trash2,
  X,
  Palette,
  Minus,
  Plus,
} from 'lucide-react';
import type { InkStroke, InkStrokePoint } from '../../../shared/types/annotation';
import { renderInkStroke } from '../../libs/reader/ink-bezier';
import { TranslationKey } from '../../translations';

interface InkCanvasOverlayProps {
  isActive: boolean;
  onClose: () => void;
  pageNumber: number;
  initialStrokes?: InkStroke[];
  onStrokesChange?: (strokes: InkStroke[]) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const INK_PALETTE = [
  { id: 'charcoal', hex: '#1e293b', label: 'Charcoal' },
  { id: 'amber', hex: '#d97706', label: 'Amber' },
  { id: 'sky', hex: '#0284c7', label: 'Sky' },
  { id: 'emerald', hex: '#059669', label: 'Emerald' },
  { id: 'rose', hex: '#e11d48', label: 'Rose' },
  { id: 'violet', hex: '#7c3aed', label: 'Violet' },
];

export const InkCanvasOverlay: React.FC<InkCanvasOverlayProps> = ({
  isActive,
  onClose,
  pageNumber,
  initialStrokes = [],
  onStrokesChange,
  t,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drawing state
  const [strokes, setStrokes] = useState<InkStroke[]>(initialStrokes);
  const [redoStack, setRedoStack] = useState<InkStroke[][]>([]);
  const [currentTool, setCurrentTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [activeColor, setActiveColor] = useState<string>('#d97706');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const currentStrokeRef = useRef<InkStroke | null>(null);

  // Sync with initialStrokes when page changes
  useEffect(() => {
    setStrokes(initialStrokes);
    setRedoStack([]);
  }, [pageNumber, initialStrokes]);

  // Redraw all strokes onto canvas
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokes) {
      renderInkStroke(ctx, stroke);
    }

    if (currentStrokeRef.current) {
      renderInkStroke(ctx, currentStrokeRef.current);
    }
  }, [strokes]);

  // Adjust canvas size to match container with devicePixelRatio for ultra-sharp ink
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      redrawAll();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [redrawAll]);

  useEffect(() => {
    redrawAll();
  }, [redrawAll]);

  // Pointer event handlers supporting stylus pen pressure
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Stylus pressure normalization
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;

    canvas.setPointerCapture(e.pointerId);
    setIsDrawing(true);

    if (currentTool === 'eraser') {
      // Find and remove stroke near click
      const remaining = strokes.filter((s) => {
        return !s.points.some((p) => Math.hypot(p.x - x, p.y - y) < Math.max(12, strokeWidth * 3));
      });
      if (remaining.length !== strokes.length) {
        setRedoStack((prev) => [strokes, ...prev]);
        setStrokes(remaining);
        onStrokesChange?.(remaining);
      }
      return;
    }

    const newStroke: InkStroke = {
      id: `stroke-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      points: [{ x, y, pressure, time: Date.now() }],
      color: activeColor,
      width: currentTool === 'highlighter' ? Math.max(14, strokeWidth * 4) : strokeWidth,
      tool: currentTool,
    };

    currentStrokeRef.current = newStroke;
    redrawAll();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (currentTool === 'eraser') {
      const remaining = strokes.filter((s) => {
        return !s.points.some((p) => Math.hypot(p.x - x, p.y - y) < Math.max(14, strokeWidth * 3));
      });
      if (remaining.length !== strokes.length) {
        setStrokes(remaining);
        onStrokesChange?.(remaining);
      }
      return;
    }

    if (!currentStrokeRef.current) return;

    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    currentStrokeRef.current.points.push({ x, y, pressure, time: Date.now() });

    redrawAll();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
      const updated = [...strokes, currentStrokeRef.current];
      setRedoStack((prev) => [strokes, ...prev]);
      setStrokes(updated);
      onStrokesChange?.(updated);
    }

    currentStrokeRef.current = null;
    redrawAll();
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const previous = strokes.slice(0, -1);
    const removed = strokes[strokes.length - 1];
    setRedoStack((prev) => [[removed], ...prev]);
    setStrokes(previous);
    onStrokesChange?.(previous);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const [nextStrokes, ...restRedo] = redoStack;
    const updated = [...strokes, ...nextStrokes];
    setRedoStack(restRedo);
    setStrokes(updated);
    onStrokesChange?.(updated);
  };

  const handleClear = () => {
    if (strokes.length === 0) return;
    setRedoStack((prev) => [strokes, ...prev]);
    setStrokes([]);
    onStrokesChange?.([]);
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-20 overflow-hidden ${
        isActive ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* Interactive Stylus Ink Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full h-full touch-none select-none cursor-crosshair"
      />

      {/* Floating Stylus Drawing Toolbar */}
      {isActive && (
        <div className="absolute top-4 inset-inline-end-4 z-30 bg-surface/95 backdrop-blur-md border border-subtle p-2 rounded-2xl shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150 text-xs font-sans">
          {/* Tool Selector */}
          <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle">
            <button
              onClick={() => setCurrentTool('pen')}
              title="Stylus Pen"
              className={`p-1.5 rounded-lg font-bold transition-all ${
                currentTool === 'pen'
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentTool('highlighter')}
              title="Ink Highlighter"
              className={`p-1.5 rounded-lg font-bold transition-all ${
                currentTool === 'highlighter'
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentTool('eraser')}
              title="Eraser"
              className={`p-1.5 rounded-lg font-bold transition-all ${
                currentTool === 'eraser'
                  ? 'bg-pale-sky-500 text-white shadow-xs'
                  : 'text-muted hover:text-main'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Color Palette (Disabled in eraser mode) */}
          {currentTool !== 'eraser' && (
            <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl border border-subtle">
              {INK_PALETTE.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveColor(c.hex)}
                  title={c.label}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    activeColor === c.hex ? 'scale-125 ring-2 ring-pale-sky-500 ring-offset-1' : 'opacity-80'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          )}

          {/* Stroke Width Controls */}
          <div className="flex items-center gap-1 bg-canvas px-2 py-1 rounded-xl border border-subtle text-[11px] font-mono text-muted">
            <button
              onClick={() => setStrokeWidth((w) => Math.max(1, w - 1))}
              className="hover:text-main cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="w-4 text-center font-bold text-main">{strokeWidth}</span>
            <button
              onClick={() => setStrokeWidth((w) => Math.min(10, w + 1))}
              className="hover:text-main cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* History Controls */}
          <div className="flex items-center gap-1">
            <button
              disabled={strokes.length === 0}
              onClick={handleUndo}
              title="Undo"
              className="p-1.5 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-30 cursor-pointer text-muted hover:text-main"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={redoStack.length === 0}
              onClick={handleRedo}
              title="Redo"
              className="p-1.5 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-30 cursor-pointer text-muted hover:text-main"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              disabled={strokes.length === 0}
              onClick={handleClear}
              title="Clear Canvas"
              className="p-1.5 rounded-lg hover:bg-canvas border border-subtle disabled:opacity-30 cursor-pointer text-muted hover:text-rose-600"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="h-4 w-px bg-subtle" />

          {/* Close Ink Drawing Mode */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-canvas text-muted hover:text-main cursor-pointer"
            title="Exit Ink Mode"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
