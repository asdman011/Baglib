'use client';
import React from 'react';
import { Check } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

const colors = [
  ['#facc15', 'pdfColorYellow'], ['#22c55e', 'pdfColorGreen'],
  ['#3b82f6', 'pdfColorBlue'], ['#ef4444', 'pdfColorRed'],
  ['#a855f7', 'pdfColorPurple'], ['#000000', 'pdfColorBlack'], ['#ffffff', 'pdfColorWhite'],
] as const;

export function PdfColorSwatches({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  const { t } = useWorkspace();
  return <div role="group" aria-label={label} className="flex flex-wrap gap-2 py-2">
    {colors.map(([color, key]) => <button key={color} type="button" title={t(key)} aria-label={t(key)} aria-pressed={value.toLowerCase() === color} onClick={() => onChange(color)} className="flex size-7 items-center justify-center rounded-lg border-2 border-slate-400 shadow-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-emerald-500 aria-pressed:ring-2 aria-pressed:ring-emerald-500 aria-pressed:ring-offset-2" style={{ backgroundColor: color, color: color === '#ffffff' || color === '#facc15' ? '#000000' : '#ffffff' }}>
      {value.toLowerCase() === color && <Check size={16} strokeWidth={3} />}
    </button>)}
    <input aria-label={t('pdfColorCustom')} title={t('pdfColorCustom')} type="color" value={value} onChange={event => onChange(event.target.value)} className="h-7 w-9 rounded-lg border border-slate-400" />
  </div>;
}
