import type { BookItem, ReadingStatus } from '../../types/library';
import type { TranslationKey } from '../../translations';

/** Icon names for card actions; the menu maps each to its lucide icon. */
export type CardActionIcon = 'BookOpen' | 'Info' | 'Bookmark' | 'ArrowLeftRight' | 'Trash2' | 'History' | 'FilePenLine'
  | 'FolderTree' | 'Tags' | 'BookMarked' | 'Heart' | 'CopyCheck' | 'FolderOpen' | 'Download';

export interface CardAction {
  id: string;
  label: string;
  icon: CardActionIcon;
  danger?: boolean;
  disabledReason?: string;
  onSelect: () => void | Promise<unknown>;
}

export interface CardActionHandlers {
  onAction?: (id: string, book: BookItem) => void | Promise<unknown>;
  onRead: (book: BookItem) => void;
  onOpenDetails: (book: BookItem) => void;
  onUpdateReadingStatus?: (bookId: string, status: ReadingStatus) => void;
  onLend?: (book: BookItem) => void;
  onDelete?: (bookId: string) => void;
}

/**
 * Builds the centralized list of actions available for a book card.
 * Used by the card hover/focus overlay, the card ⋯ menu, and reusable by KEY-316 right-click context menu.
 */
export function getCardActions(
  book: BookItem,
  handlers: CardActionHandlers,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): CardAction[] {
  const actions: CardAction[] = [];

  // 1. Primary Read Action
  actions.push({
    id: 'read',
    label: t('readBook'),
    icon: 'BookOpen',
    onSelect: () => handlers.onRead(book),
  });

  // 2. Details & Info Modal
  actions.push({
    id: 'details',
    label: t('bookDetailsBtn'),
    icon: 'Info',
    onSelect: () => handlers.onOpenDetails(book),
  });

  // 3. Reading Status Toggle
  if (handlers.onUpdateReadingStatus) {
    const currentStatus = book.readingStatus || 'unread';
    const nextStatus: ReadingStatus =
      currentStatus === 'unread' ? 'reading' : currentStatus === 'reading' ? 'completed' : 'unread';
    const nextLabelKey =
      nextStatus === 'reading' ? 'statusReading' : nextStatus === 'completed' ? 'statusCompleted' : 'statusUnread';
    actions.push({
      id: 'toggle-status',
      label: `${t('readingStatus')}: ${t(nextLabelKey as TranslationKey)}`,
      icon: 'Bookmark',
      onSelect: () => handlers.onUpdateReadingStatus!(book.id, nextStatus),
    });
  }

  // 4. Lend / Return (Lending action)
  if (handlers.onLend) {
    const activeLend = book.lendingHistory?.find((l) => !l.isReturned);
    actions.push({
      id: 'lend',
      label: activeLend ? t('returnBookBtn') : t('lendBookBtn'),
      icon: 'ArrowLeftRight',
      onSelect: () => handlers.onLend!(book),
    });
  }

  // 5. Delete Action
  if (handlers.onDelete) {
    actions.push({
      id: 'delete',
      label: t('delete'),
      icon: 'Trash2',
      danger: true,
      onSelect: () => handlers.onDelete!(book.id),
    });
  }

  if (handlers.onAction) {
    const extra: { id: string; key: TranslationKey; icon: CardActionIcon }[] = [
      { id: 'last', key: 'ctxLastPage', icon: 'History' }, { id: 'metadata', key: 'ctxEditMetadata', icon: 'FilePenLine' },
      { id: 'category', key: 'ctxClassify', icon: 'FolderTree' }, { id: 'tags', key: 'ctxTags', icon: 'Tags' },
      { id: 'physical', key: 'ctxPhysical', icon: 'BookMarked' }, { id: 'wishlist', key: 'ctxWishlist', icon: 'Heart' },
      { id: 'duplicates', key: 'ctxDuplicates', icon: 'CopyCheck' }, { id: 'folder', key: 'ctxShowFolder', icon: 'FolderOpen' }, { id: 'export', key: 'ctxExport', icon: 'Download' },
    ];
    actions.splice(2, 0, ...extra.map(entry => ({ id: entry.id, label: t(entry.key), icon: entry.icon,
      disabledReason: entry.id === 'folder' && !book.filePath ? t('ctxUnavailable') : undefined,
      onSelect: () => handlers.onAction!(entry.id, book) })));
  }
  return actions;
}
