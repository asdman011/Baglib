'use client';
import React, { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { PdfWorkstationPanel } from './PdfWorkstationPanel';
export function PdfCreationLauncher() {
  const { t, refreshBooks } = useWorkspace();
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} title={t('pdfNewBlank')} aria-label={t('pdfNewBlank')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-subtle text-muted hover:text-main text-xs font-semibold"><FilePlus2 className="size-3.5" /><span className="hidden sm:inline">{t('pdfNewBlank')}</span></button>{open && <PdfWorkstationPanel onClose={() => { setOpen(false); void refreshBooks(); }} />}</>;
}
