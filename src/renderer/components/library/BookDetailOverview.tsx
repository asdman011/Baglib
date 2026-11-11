'use client';

import React, { useEffect, useState } from 'react';
import { BookOpen, Minus, Plus } from 'lucide-react';
import type { BookDetailSummary, BookItem } from '../../../shared/types/work';
import { useWorkspace } from '../context/WorkspaceContext';
import { ReadingLogPanel } from '../notes/ReadingLogPanel';
import { Sheet } from '../ui/Sheet';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { formatCoverUrl } from '../../utils/file-path-helper';
import { BookVolumeBadge } from './BookVolumesPanel';

export function BookDetailOverview({ book, onClose, onEdit, onDelete, returnFocus }: {
  book: BookItem;
  onClose: () => void;
  onEdit: (tab: 'info' | 'lending') => void;
  onDelete: () => void;
  returnFocus: React.RefObject<HTMLElement | null>;
}) {
  const { t, lang, openBookForReading } = useWorkspace();
  const [zoom, setZoom] = useState(1);
  const [summary, setSummary] = useState<BookDetailSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false);
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    window.electronAPI.getBookDetailSummary(book.id).then(value => {
      if (active) { setSummary(value); setFailed(!value); }
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [book.id, attempt]);
  const readSource = async (sourceId?: string) => {
    if (opening) return;
    setOpening(true);
    try {
      const sourceBook = sourceId ? await window.electronAPI.getBookSource(book.id, sourceId) : book;
      if (!sourceBook?.filePath) throw new Error('source-required');
      onClose();
      openBookForReading(sourceBook);
    } catch { setFailed(true); }
    finally { setOpening(false); }
  };
  const progress = Math.round(Math.min(100, Math.max(0, Number(book.readingProgress) || 0)));
  return <Sheet open onClose={onClose} returnFocus={returnFocus} title={t('bookDetailsBtn')} className="!max-w-3xl">
    <div data-book-detail-overview className="space-y-6 text-sm leading-loose">
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-start">
        <div className="space-y-3 mx-auto sm:mx-0 max-w-full">
          <div data-cover-zoom style={{ width: 160 * zoom, maxWidth: '100%' }} className="aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden bg-canvas border border-subtle shadow-sm">
            {book.coverImage ? <img src={formatCoverUrl(book.coverImage)} alt={book.title} className="size-full object-contain" /> : <BookOpen className="size-16 text-muted" aria-hidden="true" />}
          </div>
          <div className="flex justify-center gap-2">
            <IconButton label={t('readerZoomOut')} variant="secondary" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.25))}><Minus className="size-4" /></IconButton>
            <IconButton label={t('readerZoomIn')} variant="secondary" disabled={zoom >= 1.75} onClick={() => setZoom(value => Math.min(1.75, value + 0.25))}><Plus className="size-4" /></IconButton>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <BookVolumeBadge book={book} t={t} />
          <h1 dir="auto" className="font-display text-2xl sm:text-3xl font-bold leading-relaxed break-words">{book.title}</h1>
          <p dir="auto" className="text-base text-muted leading-loose break-words">{book.author || t('unknownAuthor')}</p>
          <div className="flex flex-wrap gap-2">
            {book.bookType !== 'physical' && <Badge className="leading-relaxed">{t('bookTypeDigital')}</Badge>}
            {book.bookType !== 'digital' && <Badge className="leading-relaxed">{t('bookTypePhysical')}</Badge>}
          </div>
          <Button data-detail-read disabled={!book.filePath || opening} loading={opening} onClick={() => void readSource()} icon={<BookOpen className="size-4" />}>{t('readBook')}</Button>
          <div className="space-y-2">
            <p className="text-muted">{t('readingProgressPercent', { percent: progress.toLocaleString(lang) })}</p>
            <progress aria-label={t('sortReadingProgress')} max={100} value={progress} className="block w-full h-2 accent-primary" />
          </div>
          {summary && <dl className="flex gap-6">
            <div><dt className="text-muted">{t('detailNotes')}</dt><dd data-detail-notes className="font-semibold text-lg">{summary.notes.toLocaleString(lang)}</dd></div>
            <div><dt className="text-muted">{t('detailCards')}</dt><dd data-detail-cards className="font-semibold text-lg">{summary.cards.toLocaleString(lang)}</dd></div>
          </dl>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button data-detail-edit variant="secondary" onClick={() => onEdit('info')}>{t('editMaterialTitle')}</Button>
        <div>
          <Button variant="secondary" aria-expanded={actionsExpanded} onClick={() => setActionsExpanded(value => !value)}>{t('detailMoreActions')}</Button>
          {actionsExpanded && <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="secondary" onClick={() => onEdit('lending')}>{t('detailLend')}</Button>
            <Button variant="danger" onClick={onDelete}>{t('deleteFromLibrary')}</Button>
          </div>}
        </div>
      </div>
      {book.description && <p dir="auto" className="text-muted whitespace-pre-wrap break-words">{book.description}</p>}
      <section aria-label={t('detailEditions')} className="space-y-3 border-t border-subtle pt-5">
        <h2 className="font-semibold text-base">{t('detailEditions')}</h2>
        {!summary && !failed && <Skeleton className="h-24 w-full" />}
        {failed && <div role="alert" className="flex flex-wrap gap-3 items-center"><p>{t('detailLoadFailed')}</p><Button variant="secondary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>{t('lookupRetry')}</Button></div>}
        {summary?.editions.map(edition => <div key={edition.id} data-detail-edition className="rounded-xl border border-subtle p-4 space-y-3 min-w-0">
          <h3 className="font-semibold break-words">{edition.label || t('detailUnlabelledEdition')}</h3>
          <p dir="auto" className="text-muted break-words">{[edition.publisher, edition.publicationYear, edition.language, edition.isbn].filter(Boolean).join(' · ')}</p>
          <ul className="space-y-2">
            {edition.sources.map(source => <li key={source.id} data-detail-source className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas p-3 min-w-0">
              <Badge className="leading-relaxed">{t(source.type === 'physical' ? 'bookTypePhysical' : source.type === 'wishlist' ? 'detailWishlist' : 'bookTypeDigital')}</Badge>
              {source.type === 'hybrid' && <Badge className="leading-relaxed">{t('bookTypePhysical')}</Badge>}
              {source.format && <Badge className="leading-relaxed">{source.format}</Badge>}
              <span dir="auto" className="flex-1 min-w-0 break-words [overflow-wrap:anywhere]">{source.filePath?.split(/[\\/]/).pop() || [source.room, source.shelf].filter(Boolean).join(' · ') || t('detailSource')}</span>
              {source.filePath && <Button variant="secondary" size="sm" disabled={opening} onClick={() => void readSource(source.id)}>{t('readBook')}</Button>}
            </li>)}
          </ul>
        </div>)}
      </section>
      <section className="border-t border-subtle pt-4" data-detail-reading-log>
        <Button variant="ghost" aria-expanded={logExpanded} onClick={() => setLogExpanded(value => !value)}>{t('waveReadingLog')}</Button>
        {logExpanded && <div className="pt-3 [&>details>summary]:hidden" ref={node => { node?.querySelector('details')?.setAttribute('open', ''); }}><ReadingLogPanel workId={book.id} /></div>}
      </section>
    </div>
  </Sheet>;
}
