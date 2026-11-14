'use client';

import type { LibrarySeriesEntry } from '../../../shared/library-series';
import { useWorkspace } from '../context/WorkspaceContext';
import { LibraryBookCover } from './LibraryBookCover';

interface LibrarySeriesCardProps {
  series: LibrarySeriesEntry;
  onOpen: () => void;
  row?: boolean;
}

export function LibrarySeriesCard({ series, onOpen, row = false }: LibrarySeriesCardProps) {
  const { t, lang } = useWorkspace();
  return (
    <button
      type="button"
      data-library-series={series.id}
      data-library-book-card={!row || undefined}
      aria-label={series.title}
      onClick={onOpen}
      className={'rounded-xl border border-border bg-surface p-3 text-start leading-relaxed hover:border-primary focus-visible:ring-2 focus-visible:ring-focus ' + (row ? 'w-full flex items-center gap-3' : 'flex flex-col gap-2')}
    >
      <div className={row ? 'w-10 shrink-0' : 'w-full'}>
        <LibraryBookCover url={series.items[0]?.coverImage} title={series.title} />
      </div>
      <div>
        <h3 className="font-display font-bold text-sm leading-relaxed"><bdi>{series.title}</bdi></h3>
        <p className="text-xs text-text-muted leading-relaxed">
          {t('librarySeriesItems', { count: new Intl.NumberFormat(lang).format(series.items.length) })}
        </p>
      </div>
    </button>
  );
}
