'use client';
import { Button, EmptyState, Skeleton } from '../ui';
import { measurementLabel } from '../../../shared/pdf-study-tools';
import { useWorkspace } from '../context/WorkspaceContext';
import React, { useEffect, useMemo, useState } from 'react';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import type { PdfReview } from '../../../shared/types/pdf-collaboration';
import { filterMarks, markKind, markPage, parseShapeMark, type ListedMark, type MarkFilter, type MarkKind } from '../../../shared/pdf-markup';
import { parseEpubLocation, groupMarksByChapter } from '../../../shared/epub-marks';
import { normalizeArabicText } from '../../../shared/utils/text-normalizer';
import { HIGHLIGHT_COLORS } from '../../libs/reader/highlight-manager';
import type { TranslationKey } from '../../translations';
import { HIGHLIGHT_COLOR_HEX } from './PdfNativeViewer';

export const markKindKeys: Record<MarkKind, TranslationKey> = {
  highlight: 'markupToolHighlight', underline: 'markupToolUnderline', strike: 'markupToolStrike', rect: 'markupToolRect', oval: 'markupToolOval',
  arrow: 'markupToolArrow', text: 'markupToolText', area: 'markupToolArea', pin: 'markupToolComment', note: 'markKindNote', question: 'markKindQuestion',
  stamp: 'markupToolStamp', measure: 'markupToolMeasure', quote: 'markKindQuote', bookmark: 'markKindBookmark', review: 'markKindReview',
};
const normalize = (text: string) => normalizeArabicText(text, { normalizeTaaMarbuta: false }).toLowerCase();

/**
 * One list for study marks (BagLib's database) and PDF review comments (bound to the file), labelled
 * by layer, with Acrobat's filters: layer, type, colour, date, status, search; sorted by chapter for EPUB
 * or by page for PDF (Waves 9.2, 9.3, and KEY-274).
 */
export function PdfMarksList({ items, reviews = [], onJump, onOpenMark, isReflowable, loading = false, onStartMark, t }: {
  loading?: boolean;
  onStartMark?: () => void;
  items: KnowledgeItemDTO[];
  reviews?: PdfReview[];
  onJump: (page: number, cfi?: string) => void;
  onOpenMark?: (item: KnowledgeItemDTO, at: { x: number; y: number }) => void;
  isReflowable?: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const { lang } = useWorkspace();
  const [threads, setThreads] = useState<Record<string, { open: number; total: number }>>({});
  useEffect(() => {
    let alive = true;
    void window.electronAPI?.knowledgeHistory?.commentTotals?.().then(counts => { if (alive) setThreads(counts); }, () => {});
    return () => { alive = false; };
  }, [items]);

  const marks = useMemo<ListedMark[]>(() => [
    ...items.map(item => {
      const kind = markKind(item);
      const shape = parseShapeMark(item.location);
      const epubLoc = parseEpubLocation(item.location);
      const count = threads[item.id];
      return {
        id: item.id,
        layer: 'study' as const,
        kind,
        page: epubLoc?.page ?? markPage(item.location),
        chapter: epubLoc?.chapter ?? null,
        cfi: epubLoc?.cfi ?? null,
        createdAt: item.createdAt,
        color: shape?.color ?? epubLoc?.color ?? item.color,
        text: (shape?.shape === 'measure' ? measurementLabel(shape, lang) : '') || item.quotedText || item.noteContent || item.questionText || item.label || '',
        ...(count ? { status: count.open ? 'open' as const : 'resolved' as const } : {}),
      };
    }),
    ...reviews.map(review => ({
      id: review.id,
      layer: 'review' as const,
      kind: 'review' as const,
      page: review.page,
      createdAt: review.updatedAt,
      text: [`${review.author}: ${review.text}`, ...review.replies.map(reply => `${reply.author}: ${reply.text}`)].join('\n'),
      status: review.status === 'open' ? 'open' as const : 'resolved' as const,
    })),
  ], [items, reviews, threads, lang]);

  const isEpub = isReflowable || marks.some(m => !!m.chapter || !!m.cfi);
  const [filter, setFilter] = useState<MarkFilter>({
    layer: 'all',
    kind: 'all',
    since: 'all',
    status: 'all',
    sort: isEpub ? 'chapter' : 'page',
    query: '',
  });

  const shown = useMemo(() => filterMarks(marks, filter, normalize), [marks, filter]);
  const kinds = useMemo(() => [...new Set(marks.map(mark => mark.kind))], [marks]);
  const set = (patch: Partial<MarkFilter>) => setFilter(current => ({ ...current, ...patch }));
  const field = 'rounded border border-subtle bg-canvas px-1.5 py-1 text-[11px]';

  const renderMarkRow = (mark: ListedMark) => {
    const originalItem = items.find(k => k.id === mark.id);
    return (
      <li key={`${mark.layer}-${mark.id}`}>
        <button
          type="button"
          data-marks-row={mark.id}
          data-marks-row-kind={mark.kind}
          disabled={!mark.page && !mark.cfi}
          onClick={event => {
            if (mark.page || mark.cfi) {
              onJump(mark.page ?? 1, mark.cfi ?? undefined);
            }
            if (onOpenMark && originalItem) {
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenMark(originalItem, { x: rect.right, y: rect.top });
            }
          }}
          className="w-full rounded-lg border border-subtle bg-surface p-2 text-start hover:bg-canvas disabled:cursor-default"
        >
          <span className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
            {mark.color && (
              <span
                className="inline-block size-2.5 rounded-full"
                style={{ backgroundColor: HIGHLIGHT_COLOR_HEX[mark.color] || '#FACC15' }}
              />
            )}
            <span className="font-semibold text-main">{t(markKindKeys[mark.kind])}</span>
            <span
              className={`rounded px-1 ${
                mark.layer === 'review'
                  ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {t(mark.layer === 'review' ? 'marksLayerReviewShort' : 'marksLayerStudyShort')}
            </span>
            {mark.chapter && (
              <span
                className="truncate max-w-[130px] rounded bg-pale-sky-500/10 px-1 font-sans text-pale-sky-700 dark:text-pale-sky-300"
                title={mark.chapter}
              >
                {mark.chapter}
              </span>
            )}
            {mark.page && <span>{t('page')} {mark.page}</span>}
            {mark.status && (
              <span data-marks-status-label={mark.status}>
                {t(mark.status === 'open' ? 'marksStatusOpen' : 'marksStatusResolved')}
              </span>
            )}
          </span>
          {mark.text && (
            <span dir="auto" className="line-clamp-3 block whitespace-pre-wrap leading-relaxed text-main">
              {mark.text}
            </span>
          )}
        </button>
      </li>
    );
  };

  const groupedByChapter = useMemo(() => {
    if (isEpub && filter.sort !== 'newest') {
      return groupMarksByChapter(shown, t('epubMarksGeneral'));
    }
    return null;
  }, [isEpub, filter.sort, shown, t]);

  return (
    <section data-pdf-marks className="flex min-h-0 flex-1 flex-col gap-2 p-3 text-xs">
      <input
        type="search"
        data-marks-search
        dir="auto"
        value={filter.query}
        onChange={event => set({ query: event.target.value })}
        placeholder={t('marksSearch')}
        aria-label={t('marksSearch')}
        className={`${field} w-full`}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <select
          data-marks-layer
          aria-label={t('marksLayer')}
          value={filter.layer}
          onChange={event => set({ layer: event.target.value as MarkFilter['layer'] })}
          className={field}
        >
          <option value="all">{t('marksLayerAll')}</option>
          <option value="study">{t('marksLayerStudy')}</option>
          <option value="review">{t('marksLayerReview')}</option>
        </select>
        <select
          data-marks-kind
          aria-label={t('marksKind')}
          value={filter.kind}
          onChange={event => set({ kind: event.target.value as MarkFilter['kind'] })}
          className={field}
        >
          <option value="all">{t('marksKindAll')}</option>
          {kinds.map(kind => <option key={kind} value={kind}>{t(markKindKeys[kind])}</option>)}
        </select>
        <select
          data-marks-since
          aria-label={t('marksSince')}
          value={filter.since}
          onChange={event => set({ since: event.target.value as MarkFilter['since'] })}
          className={field}
        >
          <option value="all">{t('marksSinceAll')}</option>
          <option value="today">{t('marksSinceToday')}</option>
          <option value="week">{t('marksSinceWeek')}</option>
        </select>
        <select
          data-marks-status
          aria-label={t('marksStatus')}
          value={filter.status}
          onChange={event => set({ status: event.target.value as MarkFilter['status'] })}
          className={field}
        >
          <option value="all">{t('marksStatusAll')}</option>
          <option value="open">{t('marksStatusOpen')}</option>
          <option value="resolved">{t('marksStatusResolved')}</option>
        </select>
        <select
          data-marks-sort
          aria-label={t('marksSort')}
          value={filter.sort}
          onChange={event => set({ sort: event.target.value as MarkFilter['sort'] })}
          className={field}
        >
          {isEpub
            ? <option value="chapter">{t('marksSortChapter')}</option>
            : <option value="page">{t('marksSortPage')}</option>}
          <option value="newest">{t('marksSortNewest')}</option>
        </select>
        <span className="flex items-center gap-1" role="group" aria-label={t('markColor')}>
          {HIGHLIGHT_COLORS.map(swatch => (
            <button
              key={swatch.id}
              type="button"
              data-marks-color={swatch.id}
              aria-pressed={filter.color === swatch.id}
              aria-label={swatch.id}
              onClick={() => set({ color: filter.color === swatch.id ? undefined : swatch.id })}
              className={`size-4 rounded-full border border-black/10 ${
                filter.color === swatch.id ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
              }`}
              style={{ backgroundColor: swatch.hex }}
            />
          ))}
        </span>
      </div>
      <p className="text-[11px] text-muted" data-marks-count>
        {t('marksCount', { shown: shown.length, total: marks.length })}
      </p>
      {loading ? <div role="status" aria-label={t('loading')} className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : !shown.length && <EmptyState title={t(marks.length ? 'marksNone' : 'feedbackMarksStart')}
        action={<Button size="sm" onClick={() => { if (marks.length) set({ layer: 'all', kind: 'all', since: 'all', status: 'all', color: undefined, query: '' }); else onStartMark?.(); }}>{t(marks.length ? 'clearAllFilters' : 'markupToolHighlight')}</Button>} />}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {groupedByChapter ? (
          Array.from(groupedByChapter.entries()).map(([chapterName, chapterMarks]) => (
            <section key={chapterName} className="space-y-1.5" data-marks-chapter-section={chapterName}>
              <div
                className="flex items-center justify-between border-b border-subtle/40 px-1 py-1 text-[11px] font-bold text-muted"
                data-marks-chapter-header={chapterName}
              >
                <span className="truncate" title={`${t('epubMarksChapter')}: ${chapterName}`}>{chapterName}</span>
                <span className="font-mono text-[10px] opacity-70">({chapterMarks.length})</span>
              </div>
              <ul className="space-y-1.5">
                {chapterMarks.map(renderMarkRow)}
              </ul>
            </section>
          ))
        ) : (
          <ul className="space-y-1.5">
            {shown.map(renderMarkRow)}
          </ul>
        )}
      </div>
    </section>
  );
}
