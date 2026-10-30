'use client';
import React, { useState } from 'react';
import { FileText, Search } from 'lucide-react';
import type { PdfCapability, PdfFeature } from '../../../shared/types/pdf-editor';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
import type { StirlingWorkstationMode } from './PdfWorkstationTools';

const groups: { label: TranslationKey; mode: StirlingWorkstationMode; tools: PdfFeature[] }[] = [
  { label: 'pdfDirectoryRecommended', mode: 'view', tools: ['redact', 'compress', 'sign', 'edit-content', 'organize', 'export-docx', 'ocr'] },
  { label: 'pdfDirectorySigning', mode: 'security', tools: ['sign'] },
  { label: 'pdfDirectorySecurity', mode: 'security', tools: ['encrypt', 'watermark', 'add-image', 'sanitize', 'unlock-forms'] },
  { label: 'pdfDirectoryVerification', mode: 'view', tools: ['inspect', 'verify-signatures', 'validate'] },
  { label: 'pdfDirectoryReview', mode: 'view', tools: ['repair-metadata', 'edit-toc', 'review'] },
  { label: 'pdfDirectoryPages', mode: 'organize', tools: ['crop', 'organize', 'split', 'scale-pages'] },
];

function toolMode(tool: PdfFeature, fallback: StirlingWorkstationMode): StirlingWorkstationMode {
  if (['redact', 'encrypt', 'watermark', 'sanitize', 'sign', 'verify-signatures', 'validate'].includes(tool)) return 'security';
  if (tool.startsWith('export-') || tool === 'ocr' || tool === 'compress') return 'convert';
  if (['edit-content', 'add-image', 'unlock-forms'].includes(tool)) return 'edit';
  if (['organize', 'split', 'crop', 'scale-pages'].includes(tool)) return 'organize';
  return fallback;
}

export function PdfToolDirectory({ capabilities, labels, disabled, onSelect }: {
  capabilities: PdfCapability[];
  labels: Record<PdfFeature, TranslationKey>;
  disabled: boolean;
  onSelect: (tool: PdfFeature, mode: StirlingWorkstationMode) => void;
}) {
  const { t } = useWorkspace();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  return <section data-pdf-tool-directory className="space-y-3">
    <h3 className="text-sm font-semibold">{t('pdfDirectoryTitle')}</h3>
    <label className="flex items-center gap-2 rounded-lg border border-subtle bg-surface text-main px-2 py-1.5 focus-within:ring-2 focus-within:ring-emerald-500">
      <Search size={14} aria-hidden="true" />
      <input aria-label={t('pdfDirectoryFilter')} placeholder={t('pdfDirectoryFilter')} value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 w-full bg-transparent text-xs outline-none" />
    </label>
    {groups.map(group => {
      const tools = group.tools.filter(tool => t(labels[tool]).toLocaleLowerCase().includes(needle));
      if (!tools.length) return null;
      return <section key={group.label}>
        <h4 className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-wide text-muted">{t(group.label)}</h4>
        {tools.map(tool => <button key={tool} type="button" disabled={disabled || tool === 'repair-metadata' || !capabilities.some(item => item.feature === tool && item.available)} onClick={() => onSelect(tool, toolMode(tool, group.mode))} className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1 text-start text-[13px] text-main hover:bg-canvas focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-40">
          <FileText size={14} aria-hidden="true" /><span>{t(labels[tool])}</span>
        </button>)}
      </section>;
    })}
  </section>;
}
