'use client';

import React from 'react';
import { Bookmark, BookOpen } from 'lucide-react';
import type { BookItem } from '../../../shared/types/work';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { LibraryBookCover } from './LibraryBookCover';
import { useWorkspace } from '../context/WorkspaceContext';

export interface FeaturedBookCardProps {
  book: BookItem;
  onOpenBook: (book: BookItem) => void;
  onOpenDetails?: (book: BookItem) => void;
  className?: string;
}

export const FeaturedBookCard: React.FC<FeaturedBookCardProps> = ({
  book,
  onOpenBook,
  onOpenDetails,
  className = '',
}) => {
  const { t } = useWorkspace();
  const progress = typeof book.readingProgress === 'number' ? book.readingProgress : 0;
  const isInProgress = book.readingStatus === 'reading' && progress > 0;

  return (
    <Card
      variant="raised"
      className={`p-4 sm:p-5 transition-all duration-200 hover:shadow-lg border-border/80 ${className}`}
      data-featured-book-card
    >
      <div className="flex flex-col-reverse sm:flex-row items-center sm:items-stretch gap-4 sm:gap-6">
        {/* Content Details (Start side in RTL and LTR) */}
        <div className="flex-1 min-w-0 flex flex-col justify-between space-y-3 text-start w-full">
          <div className="space-y-2">
            {/* Header with Bookmark & Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <Bookmark className="size-4 text-accent fill-accent shrink-0" aria-hidden="true" />
              <Badge variant="accent">
                {t('badgeFeatured')}
              </Badge>
              {book.primaryCategory && (
                <span className="text-[11px] text-text-muted font-sans font-medium">
                  • {book.primaryCategory.nameAr || book.primaryCategory.nameEn}
                </span>
              )}
            </div>

            {/* Title */}
            <h3
              onClick={() => onOpenBook(book)}
              className="font-display font-bold text-lg sm:text-xl text-text leading-snug line-clamp-2 hover:text-primary-text transition-colors cursor-pointer"
              title={book.title}
            >
              {book.title}
            </h3>

            {/* Author and Date */}
            <p className="text-xs sm:text-sm text-text-muted font-serif line-clamp-1">
              <span>{book.author}</span>
              {book.publicationYear && (
                <span className="ms-1.5 opacity-80">
                  • {book.publicationYear}
                </span>
              )}
            </p>

            {/* Short Blurb Description */}
            {book.description && (
              <p className="text-xs text-text-muted/90 font-sans line-clamp-2 leading-relaxed pt-0.5">
                {book.description}
              </p>
            )}
          </div>

          {/* Reading Progress Indicator & Actions */}
          <div className="space-y-2 pt-1 border-t border-border/60">
            {isInProgress ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-sans text-text-muted">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="size-2 rounded-full bg-accent inline-block shrink-0" aria-hidden="true" />
                    <span>{t('readingProgressPercent', { percent: progress })}</span>
                  </span>
                  <span className="font-mono text-[11px]">{progress}%</span>
                </div>
                <div className="w-full bg-canvas rounded-full h-1.5 overflow-hidden border border-border/60">
                  <div
                    className="bg-accent h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-xs text-text-muted font-sans flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary-text inline-block shrink-0" aria-hidden="true" />
                <span>{t('readingStatus') || 'متاح للقراءة'}</span>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                icon={<BookOpen className="size-3.5" />}
                onClick={() => onOpenBook(book)}
              >
                {t('readBook')}
              </Button>
              {onOpenDetails && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onOpenDetails(book)}
                >
                  {t('bookDetailsBtn')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tall Book Cover (End side in RTL and LTR) */}
        <div
          onClick={() => onOpenBook(book)}
          className="w-28 sm:w-36 shrink-0 cursor-pointer group/cover"
          title={book.title}
        >
          <LibraryBookCover
            url={book.coverImage}
            title={book.title}
            className="shadow-md group-hover/cover:shadow-xl group-hover/cover:scale-[1.02] transition-all duration-300"
          />
        </div>
      </div>
    </Card>
  );
};
