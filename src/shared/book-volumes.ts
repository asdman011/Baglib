import { getWorkTypeInfo } from './types/metadata';
import type { BookItem, BookItemInput } from './types/work';

type VolumeFields = Pick<BookItemInput, 'seriesTitle' | 'volumeNumber' | 'totalVolumes'>;
const normalized = (value: string | undefined) => (value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

export function volumeOrdinal(value: string | number | undefined): number | undefined {
  const digits = String(value ?? '').trim().replace(/[٠-٩۰-۹]/g, character => String(character.charCodeAt(0) - (character >= '۰' ? 1776 : 1632)));
  if (!/^\d+$/.test(digits)) return undefined;
  const number = Number(digits);
  return Number.isSafeInteger(number) ? number : undefined;
}

export function bookVolumeIssue(input: VolumeFields): 'bookVolumesTotalInvalid' | 'bookVolumesNumberInvalid' | 'bookVolumesNumberExceedsTotal' | 'bookVolumesTitleInvalid' | null {
  if (input.seriesTitle !== undefined && (typeof input.seriesTitle !== 'string' || input.seriesTitle.length > 300)) return 'bookVolumesTitleInvalid';
  if (input.totalVolumes !== undefined && (!Number.isInteger(input.totalVolumes) || input.totalVolumes < 1 || input.totalVolumes > 10000)) return 'bookVolumesTotalInvalid';
  if (input.volumeNumber !== undefined && (typeof input.volumeNumber !== 'string' && typeof input.volumeNumber !== 'number' || String(input.volumeNumber).length > 40)) return 'bookVolumesNumberInvalid';
  const ordinal = volumeOrdinal(input.volumeNumber);
  if (input.volumeNumber !== undefined && /^[-+]?[\d٠-٩۰-۹]+(?:[.,][\d٠-٩۰-۹]+)?$/.test(String(input.volumeNumber).trim()) && ordinal === undefined) return 'bookVolumesNumberInvalid';
  if (input.volumeNumber !== undefined && String(input.volumeNumber).trim() && (ordinal === 0 || typeof input.volumeNumber === 'number' && (!Number.isSafeInteger(input.volumeNumber) || input.volumeNumber < 1))) return 'bookVolumesNumberInvalid';
  if (ordinal !== undefined && input.totalVolumes !== undefined && ordinal > input.totalVolumes) return 'bookVolumesNumberExceedsTotal';
  return null;
}

export function relatedBookVolumes(book: BookItem, books: BookItem[]): BookItem[] {
  const set = normalized(book.seriesTitle);
  const author = normalized(book.author);
  if (!set || !author || !String(book.volumeNumber ?? '').trim()) return [];
  const compare = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  return books.filter(candidate => getWorkTypeInfo(candidate.workTypeId || candidate.workType).key === 'book' && normalized(candidate.seriesTitle) === set && normalized(candidate.author) === author && String(candidate.volumeNumber ?? '').trim()).sort((first, second) => {
    const firstNumber = volumeOrdinal(first.volumeNumber);
    const secondNumber = volumeOrdinal(second.volumeNumber);
    return firstNumber !== undefined && secondNumber !== undefined ? firstNumber - secondNumber || compare.compare(first.title, second.title) : compare.compare(String(first.volumeNumber), String(second.volumeNumber));
  });
}

export function nextBookVolume(book: BookItem, books: BookItem[], id: string): BookItem {
  const used = new Set(relatedBookVolumes(book, books).map(candidate => volumeOrdinal(candidate.volumeNumber)));
  used.add(volumeOrdinal(book.volumeNumber));
  let next = 1;
  while (used.has(next)) next++;
  return {
    id, title: book.seriesTitle?.trim() || book.title, author: book.author,
    seriesTitle: book.seriesTitle?.trim() || book.title, volumeNumber: String(next),
    totalVolumes: book.totalVolumes, workType: 'book', workTypeId: 'wt-book',
    edition: book.edition, publisher: book.publisher, language: book.language,
    categories: [...book.categories], tags: [...book.tags], contributors: book.contributors?.map(contributor => ({ ...contributor })),
    bookType: book.bookType, lendingHistory: [], readingStatus: 'unread', readingProgress: 0,
  };
}
