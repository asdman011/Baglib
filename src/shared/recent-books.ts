import type { BookItem } from './types/work';

export interface RecentReadingActivity {
  workId: string;
  lastOpenedAt: number;
}

// SQLite datetime values have no timezone suffix and represent UTC.
export function recentTimestamp(value?: string): number {
  if (!value) return 0;
  const timestamp = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function recentlyOpenedBooks(books: BookItem[], activity: RecentReadingActivity[]): BookItem[] {
  const timestamps = new Map<string, number>();
  for (const entry of activity) {
    if (Number.isFinite(entry.lastOpenedAt) && entry.lastOpenedAt > 0) {
      timestamps.set(entry.workId, Math.max(timestamps.get(entry.workId) || 0, entry.lastOpenedAt));
    }
  }
  return books.filter(book => !book.deletedAt && timestamps.has(book.id))
    .sort((a, b) => timestamps.get(b.id)! - timestamps.get(a.id)! || a.id.localeCompare(b.id));
}

/** No durable batch marker exists. Use a fixed ten-minute window ending at the newest digital work. */
export function recentlyImportedBooks(books: BookItem[], windowMs = 10 * 60 * 1000): BookItem[] {
  const imported = books.filter(book => !book.deletedAt && book.bookType !== 'physical' && Boolean(book.filePath) && recentTimestamp(book.createdAt) > 0)
    .sort((a, b) => recentTimestamp(b.createdAt) - recentTimestamp(a.createdAt) || a.id.localeCompare(b.id));
  const newest = recentTimestamp(imported[0]?.createdAt);
  return imported.filter(book => newest - recentTimestamp(book.createdAt) <= windowMs);
}
