'use client';
import React, { useState } from 'react';
import type { PdfTextBlock } from '../../../shared/types/pdf-editor';
import { useWorkspace } from '../context/WorkspaceContext';
export interface PdfInlineStyle { fontSize: number; color: string; direction: string; align: string; fontFamily: string }
export function PdfInlineEditor({ block, value, setValue, onApply, onCancel, busy }: { block: PdfTextBlock; value: string; setValue: (value: string) => void; onApply: (style: PdfInlineStyle) => void; onCancel: () => void; busy: boolean }) {
  const { t } = useWorkspace();
  const [style, setStyle] = useState<PdfInlineStyle>({ fontSize: Math.max(5, Math.round(block.fontSize || 12)), color: block.color || '#111111', direction: block.direction, align: 'start', fontFamily: /times|serif/iu.test(block.font || '') ? 'serif' : 'sans-serif' });
  const field = 'block w-full rounded border border-subtle bg-canvas p-2';
  return <section data-pdf-inline-editor className="rounded-xl border border-emerald-600 bg-surface p-3 space-y-3">
    <p className="text-xs text-muted">{t('pdfFontSubstitution')}</p>
    <label>{t('pdfText')}<textarea dir={style.direction === 'auto' ? 'auto' : style.direction === 'rtl' ? 'rtl' : 'ltr'} value={value} maxLength={100000} onChange={event => setValue(event.target.value)} className={field + ' min-h-28 leading-loose'} /></label>
    <div className="grid grid-cols-2 gap-2"><label>{t('pdfFontSize')}<input type="number" min={5} max={144} value={style.fontSize} onChange={event => setStyle(previous => ({ ...previous, fontSize: Number(event.target.value) }))} className={field} /></label><label>{t('pdfTextColor')}<input type="color" value={style.color} onChange={event => setStyle(previous => ({ ...previous, color: event.target.value }))} className="block w-full h-10" /></label></div>
    <label>{t('pdfTextAlignment')}<select value={style.align} onChange={event => setStyle(previous => ({ ...previous, align: event.target.value }))} className={field}><option value="start">{t('pdfAlignStart')}</option><option value="center">{t('pdfAlignCenter')}</option><option value="end">{t('pdfAlignEnd')}</option><option value="justify">{t('pdfAlignJustify')}</option></select></label>
    <label>{t('pdfFontFamily')}<select value={style.fontFamily} onChange={event => setStyle(previous => ({ ...previous, fontFamily: event.target.value }))} className={field}><option value="sans-serif">{t('pdfFontSans')}</option><option value="serif">{t('pdfFontSerif')}</option><option value="monospace">{t('pdfFontMono')}</option></select></label>
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => onApply(style)} className="rounded border border-subtle p-2">{t('pdfApplyStaged')}</button><button type="button" onClick={onCancel} className="rounded border border-subtle p-2">{t('pdfInlineCancel')}</button></div>
  </section>;
}
