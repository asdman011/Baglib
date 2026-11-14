import type { BookItem } from './types/work';
import { getWorkTypeInfo } from './types/metadata';
import type { LectureSeries } from './lecture-series';
import { volumeOrdinal } from './book-volumes';

export interface LibrarySeriesEntry {
  id: string;
  title: string;
  items: BookItem[];
}
export type LibraryEntry = { book: BookItem; series?: LibrarySeriesEntry };

/** Explicit lecture membership wins. Other media use existing seriesTitle and volumeNumber metadata. */
export function librarySeriesEntries(books: BookItem[], groups: LectureSeries[], allBooks = books, searching = false): LibraryEntry[] {
  if (searching) return books.map(book => ({ book }));
  const byId = new Map(allBooks.map(book => [book.id, book]));
  const membership = new Map<string, LibrarySeriesEntry>();
  for (const group of groups) {
    const items = group.items.map(item => byId.get(item.workId)).filter((book): book is BookItem => !!book);
    if (!items.length) continue;
    const entry = { id: 'lecture-series-' + group.id, title: group.name, items };
    for (const book of items) membership.set(book.id, entry);
  }
  const metadataGroups = new Map<string, LibrarySeriesEntry>();
  for (const book of allBooks) {
    const type = getWorkTypeInfo(book.workTypeId || book.workType).key;
    if (membership.has(book.id) || !['lecture', 'podcast', 'video'].includes(type) || !book.seriesTitle?.trim()) continue;
    // Keep canonical names and distinct work types. No Arabic orthographic substitutions in identity keys.
    const key = type + ':' + book.seriesTitle.normalize('NFC').trim();
    const entry = metadataGroups.get(key) ?? { id: 'media-series-' + key, title: book.seriesTitle, items: [] };
    entry.items.push(book);
    metadataGroups.set(key, entry);
    membership.set(book.id, entry);
  }
  const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
  for (const group of metadataGroups.values()) group.items.sort((a, b) =>
    (volumeOrdinal(a.volumeNumber) ?? Infinity) - (volumeOrdinal(b.volumeNumber) ?? Infinity) || collator.compare(a.title, b.title) || a.id.localeCompare(b.id));
  const emitted = new Set<string>();
  return books.flatMap(book => {
    const series = membership.get(book.id);
    if (!series) return [{ book }];
    if (emitted.has(series.id)) return [];
    emitted.add(series.id);
    return [{ book: series.items[0], series }];
  });
}
