'use client';
import React, { useRef } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
export function PdfInkPad({ strokes, onChange, color = '#000000' }: { strokes: number[][][]; onChange: (value: number[][][]) => void; color?: string }) {
  const { t } = useWorkspace();
  const drawing = useRef(false);
  const position = (event: React.PointerEvent<SVGSVGElement>) => { const area = event.currentTarget.getBoundingClientRect(); return [Math.max(0, Math.min(1, (event.clientX - area.left) / area.width)), Math.max(0, Math.min(1, (event.clientY - area.top) / area.height))]; };
  return <div><svg role="img" aria-label={t('pdfInkPad')} viewBox="0 0 1 1" preserveAspectRatio="none" className="w-full h-36 bg-white border rounded touch-none" onPointerDown={event => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); onChange([...strokes, [position(event)]]); }} onPointerMove={event => { if (drawing.current && strokes.length && strokes.at(-1)!.length < 2000) onChange([...strokes.slice(0, -1), [...strokes.at(-1)!, position(event)]]); }} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }}>{strokes.map((stroke, index) => <polyline key={index} points={stroke.map(point => point.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="0.005" strokeLinecap="round" strokeLinejoin="round" />)}</svg><button type="button" onClick={() => onChange([])} className="underline text-xs p-2">{t('pdfInkClear')}</button></div>;
}
