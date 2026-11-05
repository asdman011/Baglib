'use client';

import React, { useMemo, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { compareTexts, type CompareKind } from '../../../shared/ocr-compare';

const tone: Record<CompareKind, string> = {
  same: '',
  changed: 'bg-amber-400/30 rounded px-0.5',
  missing: 'bg-sky-400/25 rounded px-0.5 underline decoration-dotted',
  extra: 'bg-red-400/25 rounded px-0.5 line-through',
};

/** KEY-259: OCR text beside a pasted reference such as Shamela's. Neither text is changed. */
export function OcrCompare({ text }: { text: string }) {
  const { t } = useWorkspace();
  const [reference, setReference] = useState('');
  const result = useMemo(() => reference.trim() ? compareTexts(text, reference) : null, [text, reference]);
  return <details className="rounded-xl border border-subtle p-3 space-y-2" data-ocr-compare>
    <summary className="cursor-pointer text-xs font-bold">{t('ocrCompareTitle')}</summary>
    <p className="text-[11px] text-muted leading-relaxed">{t('ocrCompareNotice')}</p>
    <textarea dir="auto" rows={4} value={reference} onChange={event => setReference(event.target.value)} maxLength={200_000} aria-label={t('ocrCompareReference')} placeholder={t('ocrCompareReference')} className="w-full rounded-lg border border-subtle bg-canvas p-2 text-sm leading-loose" />
    {result && <>
      <p className="text-[11px] text-muted">{t('ocrCompareSummary', { same: result.same, changed: result.changed, missing: result.missing, extra: result.extra })}{result.truncated && ` · ${t('ocrCompareTruncated')}`}</p>
      <p className="flex flex-wrap gap-x-3 text-[11px]"><span className={tone.changed}>{t('ocrCompareChanged')}</span><span className={tone.missing}>{t('ocrCompareMissing')}</span><span className={tone.extra}>{t('ocrCompareExtra')}</span></p>
      <div dir="auto" className="rounded-lg border border-subtle bg-canvas p-2 font-serif text-sm leading-loose break-words">
        {result.pieces.map((piece, index) => <React.Fragment key={index}>
          <span className={tone[piece.kind]} title={piece.kind === 'changed' ? piece.reference : undefined} data-compare={piece.kind}>{piece.kind === 'missing' ? piece.reference : piece.ocr}</span>{' '}
        </React.Fragment>)}
      </div>
    </>}
  </details>;
}
