'use client';
import React, { createContext, useContext, useRef, useState } from 'react';
import { STAMPS, UNIT_POINTS, calibratedScale, measurementLabel, type MeasureUnit, type MeasureMode } from '../../../shared/pdf-study-tools';
import { translations } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
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
  if (mark.shape === 'measure' && mark.measurement?.mode === 'distance' && mark.from && mark.to) return <line x1={mark.from.x} y1={mark.from.y} x2={mark.to.x} y2={mark.to.y} {...common} />;
  if (mark.shape === 'measure' || mark.shape === 'stamp' || mark.shape === 'rect') return <rect x={x} y={y} width={width} height={height} {...common} />;
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
  const { t, lang } = useWorkspace();
  const [stampId, setStampId] = useState<string>(STAMPS[0].id);
  const [stampLanguage, setStampLanguage] = useState<'ar' | 'en' | null>(null);
  const [measureMode, setMeasureMode] = useState<MeasureMode>('distance');
  const [unit, setUnit] = useState<MeasureUnit>('pt');
  const [knownLength, setKnownLength] = useState(10);
  const [calibrating, setCalibrating] = useState(false);
  const [calibration, setCalibration] = useState<{ unit: MeasureUnit; scale: number } | null>(null);
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
      {marks.filter(({ mark }) => mark.shape !== 'pin' && mark.shape !== 'text' && mark.shape !== 'stamp').map(({ item, mark }) => <g key={item.id} data-pdf-mark={mark.shape} data-mark-id={item.id} tabIndex={0} className="pointer-events-auto cursor-pointer" style={{ pointerEvents: 'visibleStroke' }} onClick={open(item)}>
        <ShapeSvg mark={mark} />
      </g>)}
      {preview && preview.shape !== 'pin' && preview.shape !== 'text' && <ShapeSvg mark={preview} preview />}
    </svg>
    {marks.filter(({ mark }) => mark.shape === 'text' || mark.shape === 'stamp' || mark.shape === 'measure').map(({ item, mark }) => <button key={item.id} type="button" data-pdf-mark={mark.shape} data-mark-id={item.id} dir={mark.language === 'ar' ? 'rtl' : 'auto'} onClick={open(item)}
      className={`absolute z-[26] border-2 px-1 text-[11px] text-neutral-900 ${mark.shape === 'text' ? 'overflow-hidden rounded-sm bg-white/85 text-start leading-snug' : 'rounded-md bg-white/90 text-center text-sm font-semibold leading-relaxed'}`}
      style={{ left: `${mark.box.x}%`, top: `${mark.box.y}%`, width: `${mark.shape === 'measure' ? Math.max(mark.box.width, 12) : mark.box.width}%`, minHeight: mark.shape === 'measure' ? undefined : `${mark.box.height}%`, borderColor: hex(mark.color), fontFamily: mark.shape === 'stamp' ? 'Noto Naskh Arabic, serif' : undefined }}>
      {mark.shape === 'measure' ? measurementLabel(mark, lang) : item.noteContent || context.labels.textBox}
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
    {(context.tool === 'stamp' || context.tool === 'measure') && <div data-pdf-study-options className="absolute start-2 top-2 z-[45] flex w-[22rem] max-w-[calc(100%-1rem)] flex-wrap items-center gap-2 rounded-lg border border-subtle bg-surface p-2 text-xs text-main shadow-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {context.tool === 'stamp' ? <>
        <select data-stamp-choice aria-label={t('markupToolStamp')} value={stampId} onChange={event => setStampId(event.target.value)} className="min-w-0 rounded border border-subtle bg-canvas p-1 leading-relaxed">
          {STAMPS.map(stamp => <option key={stamp.id} value={stamp.id}>{translations[stampLanguage ?? lang][stamp.label]}</option>)}
        </select>
        <select data-stamp-language aria-label={t('stampLanguage')} value={stampLanguage ?? lang} onChange={event => setStampLanguage(event.target.value as 'ar' | 'en')} className="min-w-0 max-w-full rounded border border-subtle bg-canvas p-1">
          <option value="ar">{t('langArabic')}</option><option value="en">{t('langEnglish')}</option>
        </select>
      </> : <>
        <select data-measure-mode aria-label={t('measureMode')} value={measureMode} onChange={event => setMeasureMode(event.target.value as MeasureMode)} className="min-w-0 max-w-full rounded border border-subtle bg-canvas p-1"><option value="distance">{t('measureDistance')}</option><option value="area">{t('measureArea')}</option></select>
        <select data-measure-unit aria-label={t('measureUnit')} value={unit} onChange={event => { setUnit(event.target.value as MeasureUnit); setCalibration(null); }} className="min-w-0 max-w-full rounded border border-subtle bg-canvas p-1">
          <option value="pt">{t('measurePt')}</option><option value="cm">{t('measureCm')}</option><option value="mm">{t('measureMm')}</option><option value="inch">{t('measureInch')}</option>
        </select>
        <input data-measure-length aria-label={t('measureLength')} type="number" min="0.001" max="100000" step="any" value={knownLength} onChange={event => setKnownLength(Number(event.target.value))} className="w-16 rounded border border-subtle bg-canvas p-1" />
        <button data-measure-calibrate type="button" disabled={!Number.isFinite(knownLength) || knownLength <= 0} aria-pressed={calibrating} onClick={() => setCalibrating(value => !value)} className="rounded border border-subtle p-1">{t('measureCalibrate')}</button>
        <button type="button" onClick={() => { setCalibration(null); setCalibrating(false); }} className="rounded border border-subtle p-1">{t('measureReset')}</button>
        <p className="w-full leading-relaxed" role="status">{t(calibrating ? 'measureCalibrating' : 'measureReady')}</p>
      </>}
    </div>}
    {drawing && <div ref={surface} data-pdf-draw-surface={context.tool} title={context.labels.drawHint} className="absolute inset-0 z-[40] cursor-crosshair touch-none"
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); const at = point(event); setDrag({ start: at, end: at }); event.currentTarget.setPointerCapture?.(event.pointerId); }}
      onPointerMove={event => { if (drag) setDrag({ ...drag, end: point(event) }); }}
      onPointerUp={event => {
        if (!drag) return;
        const mark = shapeFromDrag(context.tool, pageNumber, drag.start, point(event), context.color);
        setDrag(null);
        if (!mark) return;
        if (mark.shape === 'stamp') {
          const stamp = STAMPS.find(entry => entry.id === stampId)!;
          context.onCreate({ ...mark, stampId: stamp.id, language: stampLanguage ?? lang, color: stamp.color });
        } else if (mark.shape === 'measure' && mark.from && mark.to) {
          const element = surface.current?.closest<HTMLElement>('[data-pdf-width]');
          const page = { width: Number(element?.dataset.pdfWidth), height: Number(element?.dataset.pdfHeight) };
          if (!page.width || !page.height) return;
          if (calibrating) {
            setCalibration({ unit, scale: calibratedScale(mark.from, mark.to, page, knownLength) });
            setCalibrating(false);
          } else context.onCreate({ ...mark, measurement: { mode: measureMode, unit, page, pointsPerUnit: calibration?.unit === unit ? calibration.scale : UNIT_POINTS[unit], language: lang } });
        } else context.onCreate(mark);
      }}
      onPointerCancel={() => setDrag(null)} />}
  </>;
}
