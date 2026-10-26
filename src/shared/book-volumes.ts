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
  const seriesTitle = input.seriesTitle === null || input.seriesTitle === undefined ? undefined : input.seriesTitle;
  const rawTotal = input.totalVolumes === null || input.totalVolumes === undefined || (typeof input.totalVolumes === 'string' && (input.totalVolumes as string).trim() === '') ? undefined : input.totalVolumes;
  const totalVolumes = rawTotal !== undefined && typeof rawTotal === 'string' && !Number.isNaN(Number(rawTotal)) ? Number(rawTotal) : rawTotal;
  const volumeNumber = input.volumeNumber === null || input.volumeNumber === undefined || (typeof input.volumeNumber === 'string' && (input.volumeNumber as string).trim() === '') ? undefined : input.volumeNumber;

  if (seriesTitle !== undefined && (typeof seriesTitle !== 'string' || seriesTitle.length > 300)) return 'bookVolumesTitleInvalid';
  if (totalVolumes !== undefined && (!Number.isInteger(totalVolumes) || totalVolumes < 1 || totalVolumes > 10000)) return 'bookVolumesTotalInvalid';
  if (volumeNumber !== undefined && (typeof volumeNumber !== 'string' && typeof volumeNumber !== 'number' || String(volumeNumber).length > 40)) return 'bookVolumesNumberInvalid';
  const ordinal = volumeOrdinal(volumeNumber);
  if (volumeNumber !== undefined && /^[-+]?[\d٠-٩۰-۹]+(?:[.,][\d٠-٩۰-۹]+)?$/.test(String(volumeNumber).trim()) && ordinal === undefined) return 'bookVolumesNumberInvalid';
  if (volumeNumber !== undefined && String(volumeNumber).trim() && (ordinal === 0 || (typeof volumeNumber === 'number' && (!Number.isSafeInteger(volumeNumber) || volumeNumber < 1)))) return 'bookVolumesNumberInvalid';
  if (ordinal !== undefined && totalVolumes !== undefined && typeof totalVolumes === 'number' && ordinal > totalVolumes) return 'bookVolumesNumberExceedsTotal';
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
