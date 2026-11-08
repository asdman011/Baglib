'use client';
import React, { createContext, useContext, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { isShapeTool, parseShapeMark, shapeFromDrag, type MarkupTool, type Point, type ShapeMark } from '../../../shared/pdf-markup';
import { HIGHLIGHT_COLOR_HEX } from './PdfNativeViewer';

/**
 * What the PDF pages need to draw and make study marks (Waves 8.3, 9.1, 9.4). Given by the reader through context,
 * so the viewer's page components need no new props.
 */
export interface PdfMarkupContextValue {
  tool: MarkupTool;
  color: string;
  /** A finished drag (or click) with a shape tool: the reader saves it. */
  onCreate: (mark: ShapeMark) => void;
  /** A click on a saved shape or pin: the reader opens it. */
  onOpen: (item: KnowledgeItemDTO, at: { x: number; y: number }) => void;
  /** Open and total comment threads per item: a pin with threads, all resolved, turns grey. */
  threadCounts: Record<string, { open: number; total: number }>;
  labels: { pin: string; textBox: string; drawHint: string };
}
const PdfMarkupContext = createContext<PdfMarkupContextValue | null>(null);
export const PdfMarkupProvider = PdfMarkupContext.Provider;

const hex = (color: string) => HIGHLIGHT_COLOR_HEX[color] || HIGHLIGHT_COLOR_HEX.amber;

function ShapeSvg({ mark, preview }: { mark: ShapeMark; preview?: boolean }) {
  const stroke = hex(mark.color);
  const common = { stroke, strokeWidth: 2, vectorEffect: 'non-scaling-stroke' as const, fill: 'none', opacity: preview ? 0.7 : 1 };
  const { x, y, width, height } = mark.box;
  if (mark.shape === 'rect') return <rect x={x} y={y} width={width} height={height} {...common} />;
  if (mark.shape === 'area') return <rect x={x} y={y} width={width} height={height} {...common} strokeDasharray="6 4" fill={stroke} fillOpacity={0.08} />;
  if (mark.shape === 'oval') return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...common} />;
  if (mark.shape === 'arrow' && mark.from && mark.to) {
    // The head is drawn in page percent, so it is computed here rather than with an SVG marker (which would stretch).
    const angle = Math.atan2(mark.to.y - mark.from.y, mark.to.x - mark.from.x), size = 2;
    const left = { x: mark.to.x - size * Math.cos(angle - 0.45), y: mark.to.y - size * Math.sin(angle - 0.45) };
    const right = { x: mark.to.x - size * Math.cos(angle + 0.45), y: mark.to.y - size * Math.sin(angle + 0.45) };
    return <g {...common}><line x1={mark.from.x} y1={mark.from.y} x2={mark.to.x} y2={mark.to.y} /><polyline points={`${left.x},${left.y} ${mark.to.x},${mark.to.y} ${right.x},${right.y}`} /></g>;
  }
  return null;
}

/** Shapes, text boxes and pins of one page, and the drawing surface while a shape tool is armed. */
export function PdfMarkupLayer({ pageNumber, items }: { pageNumber: number; items: KnowledgeItemDTO[] }) {
  const context = useContext(PdfMarkupContext);
  const surface = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ start: Point; end: Point } | null>(null);
  if (!context) return null;
  const marks = items.map(item => ({ item, mark: parseShapeMark(item.location) })).filter((entry): entry is { item: KnowledgeItemDTO; mark: ShapeMark } => Boolean(entry.mark));
  const drawing = isShapeTool(context.tool);
  const point = (event: React.PointerEvent): Point => {
    const box = surface.current!.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * 100, y: ((event.clientY - box.top) / box.height) * 100 };
  };
  const preview = drag ? shapeFromDrag(context.tool, pageNumber, drag.start, drag.end, context.color) : null;
  const open = (item: KnowledgeItemDTO) => (event: React.MouseEvent) => { event.stopPropagation(); context.onOpen(item, { x: event.clientX, y: event.clientY }); };
  return <>
    {/* Outlines are drawn without catching the mouse, so the text under them stays selectable; their edges take clicks. */}
    <svg className="pdf-markup-shapes pointer-events-none absolute inset-0 z-[25] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {marks.filter(({ mark }) => mark.shape !== 'pin' && mark.shape !== 'text').map(({ item, mark }) => <g key={item.id} data-pdf-mark={mark.shape} data-mark-id={item.id} className="pointer-events-auto cursor-pointer" style={{ pointerEvents: 'visibleStroke' }} onClick={open(item)}>
        <ShapeSvg mark={mark} />
      </g>)}
      {preview && preview.shape !== 'pin' && preview.shape !== 'text' && <ShapeSvg mark={preview} preview />}
    </svg>
    {marks.filter(({ mark }) => mark.shape === 'text').map(({ item, mark }) => <button key={item.id} type="button" data-pdf-mark="text" data-mark-id={item.id} dir="auto" onClick={open(item)}
      className="absolute z-[26] overflow-hidden rounded-sm border-2 bg-white/85 px-1 text-start text-[11px] leading-snug text-neutral-900"
      style={{ left: `${mark.box.x}%`, top: `${mark.box.y}%`, width: `${mark.box.width}%`, minHeight: `${mark.box.height}%`, borderColor: hex(mark.color) }}>
      {item.noteContent || context.labels.textBox}
    </button>)}
    {marks.filter(({ mark }) => mark.shape === 'pin').map(({ item, mark }) => {
      const counts = context.threadCounts[item.id];
      const open_ = counts?.open ?? 0;
      const resolved = Boolean(counts && counts.total > 0 && counts.open === 0);
      return <button key={item.id} type="button" data-pdf-mark="pin" data-mark-id={item.id} aria-label={context.labels.pin} title={item.noteContent || context.labels.pin} onClick={open(item)}
        className="absolute z-[27] flex size-6 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full rounded-bl-none border-2 border-white text-white shadow-md"
        data-pin-resolved={resolved || undefined}
        style={{ left: `${mark.box.x}%`, top: `${mark.box.y}%`, backgroundColor: resolved ? '#9ca3af' : hex(mark.color) }}>
        <MessageSquare size={12} aria-hidden="true" />
        {open_ > 1 && <span className="absolute -end-2 -top-2 rounded-full bg-rose-600 px-1 text-[9px] leading-tight">{open_}</span>}
      </button>;
    })}
    {drawing && <div ref={surface} data-pdf-draw-surface={context.tool} title={context.labels.drawHint} className="absolute inset-0 z-[40] cursor-crosshair touch-none"
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); const at = point(event); setDrag({ start: at, end: at }); event.currentTarget.setPointerCapture?.(event.pointerId); }}
      onPointerMove={event => { if (drag) setDrag({ ...drag, end: point(event) }); }}
      onPointerUp={event => {
        if (!drag) return;
        const mark = shapeFromDrag(context.tool, pageNumber, drag.start, point(event), context.color);
        setDrag(null);
        if (mark) context.onCreate(mark);
      }}
      onPointerCancel={() => setDrag(null)} />}
  </>;
}
