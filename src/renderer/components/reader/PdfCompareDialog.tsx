'use client';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Modal } from '../ui/Modal';
import { ChevronLeft, ChevronRight, GitCompare, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { CompareResult } from '../../../shared/text-compare';

/**
 * Compare two editions (Wave 13.1): this book against another PDF in the library, word by word, with previous and
 * next difference. Removed words are struck through, added words underlined; "go to page" opens the page here.
 */
export function PdfCompareDialog({ workId, onJump, onClose }: { workId: string; onJump: (page: number) => void; onClose: () => void }) {
  const { t, dir, books } = useWorkspace();
  const others = useMemo(() => books.filter(book => book.id !== workId && book.filePath && /\.pdf$/iu.test(book.filePath)), [books, workId]);
  const [other, setOther] = useState('');
  const [ignoreDiacritics, setIgnoreDiacritics] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(CompareResult & { limited: boolean }) | null>(null);
  const [current, setCurrent] = useState(0);
  const request = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const invalidate = useCallback(() => { request.current++; }, []);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidate(); }; }, [invalidate]);
  useLayoutEffect(() => invalidate, [workId, invalidate]);
  const [previousWork, setPreviousWork] = useState(workId);
  if (previousWork !== workId) { setPreviousWork(workId); setOther(''); setResult(null); setError(null); setCurrent(0); }
  const resetComparison = () => { invalidate(); setResult(null); setError(null); setCurrent(0); };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!dialogRef.current?.contains(event.target as Node) || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (!result?.hunks.length || (event.target as HTMLElement)?.closest?.('select,input,textarea,[contenteditable="true"]')) return;
      if (event.key === 'F3' || event.key.toLowerCase() === 'n') { event.preventDefault(); setCurrent(index => event.shiftKey && event.key === 'F3' ? Math.max(0, index - 1) : Math.min(result.hunks.length - 1, index + 1)); }
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); setCurrent(index => Math.max(0, index - 1)); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [dialogRef, result]);
  useEffect(() => { dialogRef.current?.querySelector(`[data-compare-hunk="${current}"]`)?.scrollIntoView({ block: 'nearest' }); }, [current, result, dialogRef]);
  const run = async () => {
    if (!other || inFlight.current) return;
    inFlight.current = true;
    const token = ++request.current;
    setBusy(true); setError(null); setResult(null); setCurrent(0);
    try {
      const response = await window.electronAPI.pdfCompare.run(workId, other, { ignoreDiacritics });
      if (token !== request.current) return;
      if (response.ok) setResult(response.data); else setError(response.error);
    } catch { if (token === request.current) setError('engine-failed'); } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const hunk = result?.hunks[current];
  const otherTitle = others.find(book => book.id === other)?.title ?? '';
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-2 sm:p-4" dir={dir} onClick={onClose}>
    <Modal open={true} onClose={onClose} asChild focusRef={dialogRef} label={t('compareTitle')}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="compare-title" tabIndex={-1} data-pdf-compare className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-subtle bg-surface text-main shadow-2xl" onClick={event => event.stopPropagation()}>
      <header className="flex items-center gap-2 border-b border-subtle px-4 py-2">
        <GitCompare size={16} aria-hidden="true" />
        <h2 id="compare-title" className="text-sm font-bold">{t('compareTitle')}</h2>
        <button type="button" aria-label={t('close')} title={t('close')} onClick={onClose} className="ms-auto rounded p-1 hover:bg-canvas"><X size={16} /></button>
      </header>
      <div className="flex flex-wrap items-end gap-3 border-b border-subtle px-4 py-3 text-sm">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">{t('compareWith')}
          <select data-compare-other value={other} onChange={event => { resetComparison(); setOther(event.target.value); }} className="rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm">
            <option value="">{t('compareChoose')}</option>
            {others.map(book => <option key={book.id} value={book.id}>{book.title}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" data-compare-diacritics checked={ignoreDiacritics} onChange={event => { resetComparison(); setIgnoreDiacritics(event.target.checked); }} />{t('compareIgnoreDiacritics')}</label>
        <button type="button" data-compare-run disabled={!other || busy} onClick={() => void run()} className="rounded-lg bg-amber-600 px-3 py-1.5 text-white disabled:opacity-40">{busy ? t('compareWorking') : t('compareRun')}</button>
      </div>
      {!others.length && <p className="px-4 py-3 text-sm text-muted">{t('compareNoOther')}</p>}
      {error && <p role="alert" data-compare-error={error} className="px-4 py-3 text-sm text-red-600">{t(error === 'no-file' ? 'compareNoFile' : error === 'busy' ? 'assistantErrorBusy' : 'compareFailed')}</p>}
      {result && <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-4 py-2 text-xs" aria-live="polite">
          <span data-compare-summary>{result.tooDifferent ? t('compareTooDifferent') : t('compareSummary', { count: result.hunks.length, removed: result.removedWords, added: result.addedWords })}</span>
          {result.limited && <span className="text-muted">{t('compareLimited')}</span>}
          {result.hunks.length > 0 && <span className="ms-auto flex items-center gap-1">
            <button type="button" data-compare-prev aria-label={t('comparePrevious')} title={t('comparePrevious')} disabled={current === 0} onClick={() => setCurrent(index => index - 1)} className="rounded border border-subtle p-1 disabled:opacity-40"><ChevronRight size={14} className="ltr:rotate-180" /></button>
            <span data-compare-position className="tabular-nums">{current + 1} / {result.hunks.length}</span>
            <button type="button" data-compare-next aria-label={t('compareNext')} title={t('compareNext')} disabled={current >= result.hunks.length - 1} onClick={() => setCurrent(index => index + 1)} className="rounded border border-subtle p-1 disabled:opacity-40"><ChevronLeft size={14} className="ltr:rotate-180" /></button>
          </span>}
        </div>
        {!result.tooDifferent && !result.hunks.length && <p data-compare-same className="px-4 py-3 text-sm">{t('compareSame')}</p>}
        <ol className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {result.hunks.map((entry, index) => <li key={index} data-compare-hunk={index} aria-current={index === current || undefined}
            className={`rounded-lg border p-2 text-sm ${index === current ? 'border-amber-500 bg-amber-500/10' : 'border-subtle'}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
              <span>{t('compareThisEdition')}: {t('page')} {entry.aPage ?? '—'}</span>
              <span dir="auto">{otherTitle}: {t('page')} {entry.bPage ?? '—'}</span>
              {entry.aPage && <button type="button" data-compare-go onClick={() => { onJump(entry.aPage!); setCurrent(index); }} className="ms-auto underline">{t('compareGoToPage')}</button>}
            </div>
            <p dir="auto" className="leading-loose">
              <span className="text-muted">{entry.before} </span>
              {entry.removed && <del data-compare-removed className="rounded bg-red-500/15 px-0.5 text-red-700 dark:text-red-300">{entry.removed}</del>}
              {entry.removed && entry.added && ' '}
              {entry.added && <ins data-compare-added className="rounded bg-emerald-500/15 px-0.5 text-emerald-700 no-underline dark:text-emerald-300">{entry.added}</ins>}
              <span className="text-muted"> {entry.after}</span>
            </p>
          </li>)}
        </ol>
        {hunk === undefined ? null : <p className="border-t border-subtle px-4 py-1.5 text-[11px] text-muted">{t('compareKeys')}</p>}
      </div>}
    </div></Modal>
  </div>;
}
