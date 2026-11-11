'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  MoreHorizontal,
} from 'lucide-react';
import { BookItem, ReadingStatus } from '../../types/library';
import { useWorkspace } from '../context/WorkspaceContext';
import { LibraryBookCover } from './LibraryBookCover';
import { Badge } from '../ui/Badge';
import { Chip } from '../ui/Chip';
import { isRecentBook, getBookSourceBadgeType } from './library-filter-model';
import { getCardActions } from './library-card-actions';

import { ContextMenu } from '../ui/ContextMenu';
import { Menu, type MenuItemProps } from '../ui/Menu';

export type CardDensity = 'compact' | 'comfortable' | 'spacious';

export interface LibraryBookCardProps {
  onOpenMenu?: () => MenuItemProps[];
  book: BookItem;
  isSelected: boolean;
  onToggleSelect: (bookId: string, e: React.MouseEvent) => void;
  onOpenBook: (book: BookItem) => void;
  onOpenDetails: (book: BookItem) => void;
  onUpdateReadingStatus?: (bookId: string, status: ReadingStatus) => void;
  onLend?: (book: BookItem) => void;
  onDelete?: (bookId: string) => void;
  cardDensity?: CardDensity;
}

export const LibraryBookCard: React.FC<LibraryBookCardProps> = ({
  book,
  onOpenMenu,
  isSelected,
  onToggleSelect,
  onOpenBook,
  onOpenDetails,
  onUpdateReadingStatus,
  onLend,
  onDelete,
  cardDensity = 'comfortable',
}) => {
  const { t, lang } = useWorkspace();
  // Centralized Card Actions (reusable by KEY-316 context menu)
  const actions = getCardActions(
    book,
    {
      onRead: onOpenBook,
      onOpenDetails,
      onUpdateReadingStatus,
      onLend,
      onDelete,
    },
    t
  );

  const [openedItems, setOpenedItems] = useState<MenuItemProps[]>([]);
  const defaultItems = actions.map(action => ({ id: action.id, label: action.label, danger: action.danger, onClick: action.onSelect }));
  // Single Subject / Category Chip (or physical/digital fallback)
  const singleChipLabel: string | null = (() => {
    if (book.primaryCategory) {
      return lang === 'ar' ? book.primaryCategory.nameAr : book.primaryCategory.nameEn;
    }
    if (book.categories && book.categories.length > 0) {
      return book.categories[0];
    }
    const cleanTag = book.tags?.find((tag) => tag !== '#جديد' && tag !== '#new');
    if (cleanTag) {
      return cleanTag.replace(/^#/, '');
    }
    const badgeType = getBookSourceBadgeType(book);
    if (badgeType === 'physical') return t('badgePhysical');
    if (badgeType === 'wishlist') return t('badgeWishlist');
    return t('badgeDigital');
  })();

  const isCompact = cardDensity === 'compact';
  const isSpacious = cardDensity === 'spacious';

  return (
    <ContextMenu items={defaultItems} onOpenMenu={onOpenMenu}
      tabIndex={0}
      role="article"
      aria-label={book.title}
      data-library-book-card
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onOpenBook(book);
        }
      }}
      className={`group relative bg-surface border rounded-2xl flex flex-col justify-between transition-all duration-200 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-focus outline-none select-none ${
        isCompact ? 'p-2.5 rounded-xl' : isSpacious ? 'p-5 rounded-3xl' : 'p-3.5'
      } ${
        isSelected
          ? 'border-primary ring-1 ring-primary bg-primary/5'
          : 'border-border/70 hover:border-primary-text/40'
      }`}
    >
      {/* Top Cover Container */}
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden bg-canvas/30 shrink-0">
        <LibraryBookCover url={book.coverImage} title={book.title} />

        {/* Small "New / جديد" Badge in Cover Corner */}
        {isRecentBook(book) && (
          <div className="absolute top-2 start-2 z-10 pointer-events-none">
            <Badge variant="accent" className="text-[9px] px-1.5 py-0.2 shadow-sm font-sans">
              {t('badgeNew')}
            </Badge>
          </div>
        )}

        {/* Selection Checkbox in Cover Corner */}
        <input
          type="checkbox"
          checked={isSelected}
          aria-checked={isSelected}
          aria-label={t(isSelected ? 'deselectBook' : 'selectBook', { title: book.title })}
          title={t(isSelected ? 'deselectBook' : 'selectBook', { title: book.title })}
          onChange={() => {}}
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelect(book.id, event);
          }}
          className={`absolute top-2 end-2 z-30 size-5 cursor-pointer rounded accent-primary transition-opacity focus:opacity-100 ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
          }`}
        />

        {/* Hover / Focus Overlay on Cover */}
        <div
          className={`absolute inset-0 bg-black/45 backdrop-blur-[1px] transition-opacity flex items-center justify-center gap-2 p-2 z-20 ${
            'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-within:opacity-100'
          }`}
        >
          {/* Primary Read Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenBook(book);
            }}
            className="px-3 py-1.5 rounded-xl bg-primary text-primary-contrast hover:opacity-95 text-xs font-bold font-sans shadow-md flex items-center gap-1.5 cursor-pointer transition-transform active:scale-95"
            title={t('readBook')}
            data-card-read-button
           aria-label={t('readBook')}>
            <BookOpen className="size-3.5" aria-hidden="true" />
            <span>{t('readBook')}</span>
          </button>

          {/* Card ⋯ Actions Menu */}
          <Menu portal align="end" items={openedItems} trigger={properties => <button {...properties} type="button" data-card-menu-button title={t('ribbonMoreActions')} aria-label={t('ribbonMoreActions')} onClick={event => { event.stopPropagation(); setOpenedItems(onOpenMenu ? onOpenMenu() : defaultItems); properties.onClick(); }} className="rounded-xl border border-border bg-surface p-1.5 text-text shadow-md"><MoreHorizontal className="size-3.5" /></button>} />
        </div>
      </div>

      {/* Resting Card Details: Title, Author, One Chip */}
      <div className="pt-2.5 flex-1 flex flex-col justify-between space-y-1">
        <div>
          <h3
            onClick={() => onOpenBook(book)}
            className="font-display font-bold text-text hover:text-primary-text cursor-pointer leading-snug line-clamp-2 text-xs sm:text-sm"
            title={book.title}
          >
            {book.title}
          </h3>
          <p className="text-[11px] text-text-muted font-serif truncate mt-0.5">
            {book.author || t('unknownAuthor')}
          </p>
        </div>

        {/* Exactly ONE subject chip at the bottom */}
        {singleChipLabel && (
          <div className="pt-1">
            <Chip
              label={singleChipLabel}
              className="text-[10px] py-0.5 px-2 bg-canvas/70 border-border/60 text-text-muted truncate max-w-full"
            />
          </div>
        )}
      </div>
    </ContextMenu>
  );
};
